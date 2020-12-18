import * as ko from "knockout";
import * as composer from "@kospa/base/composer";
import * as system from "@kospa/base/system";
import * as activator from "@kospa/base/activator";

type ViewModel = activator.ViewModel;

//#region BaseRouter Class

const
    hasHistory = !!history.pushState,
    push = Array.prototype.push,
    slice = Array.prototype.slice;

export interface Options {
    mode?: string;
    root?: string;

    onError?: (err: any) => any;
}

export interface Route {
    matcher?: RegExp | null;
    handlers: RouteHandler[];
}

export interface Routes {
    [key: string]: Route;
    none: Route;
}

export type RouteHandler = (...args: any[]) => any;

export class BaseRouter {
    private static skip = false;
    private _current?: string;
    private timeout?: number;
    private _onError?: (err: any) => any;
    private rootRegExp?: RegExp;
    private routes: Routes = {
        none: { matcher: null, handlers: [baseNotFound] }
    };

    public mode = hasHistory ? "history" : "hash";
    public root = "";

    constructor(options?: Options) {
        if (options) {
            if (options.mode) {
                this.mode = options.mode === "history" && hasHistory ? "history" : "hash";
            }

            const root = normalizeRoute(options.root);
            if (root) {
                this.root = root + "/";
                this.rootRegExp = new RegExp("^" + this.root + "?");
            }

            if (options.onError) {
                this._onError = options.onError;
            }
        }
    }

    /**
     * Add middlewares handlers for all routes.
     * 
     * @param handlers Middlewares to add on all routes
     */
    public use(...handlers: RouteHandler[]): BaseRouter;
    /**
     * Add middlewares for all routes that match the given path prefix or regex.
     * 
     * @param path Path prefix or regex that enable the middlewares
     * @param handlers Middlewares to add on given path prefix or regex
     */
    public use(path: string | RegExp, ...handlers: RouteHandler[]): BaseRouter;
    public use(): BaseRouter {
        const
            config = createRouteConfig(arguments), // eslint-disable-line
            routeId = config.matcher.toString(),
            route = this.routes[routeId];

        if (route) {
            push.apply(route.handlers, config.handlers);
        }
        else {
            this.routes[routeId] = config;
        }

        return this;
    }

    /**
     * Remove middlewares from all routes.
     * 
     * @param handlers Middlewares to remove from all routes
     */
    public unuse(...handlers: RouteHandler[]): BaseRouter;
    /**
     * Remove middlewares from all routes that match the given path prefix or regex.
     * 
     * @param path Path prefix or regex on which middlewares were registered
     * @param handlers Middlewares to remove
     */
    public unuse(path: string | RegExp, ...handlers: RouteHandler[]): BaseRouter;
    public unuse(): BaseRouter {
        const
            config = createRouteConfig(arguments),  // eslint-disable-line
            routeId = config.matcher.toString(),
            route = this.routes[routeId];

        if (route) {
            let handler: RouteHandler | undefined,
                index: number;

            while (handler = config.handlers.pop()) { // eslint-disable-line
                index = route.handlers.indexOf(handler);
                if (index !== -1) {
                    route.handlers.splice(index, 1);
                }
            }

            if (route.handlers.length === 0) {
                delete this.routes[routeId];
            }
        }

        return this;
    }

    /**
     * Register handlers for given path.
     * 
     * @param path Path or regex
     * @param handlers Handlers for the route
     */
    public add(path: string | RegExp, ...handlers: RouteHandler[]): BaseRouter {
        const routeRegExp = typeof path === "string" ? createRouteRegExp(path) : path;
        return this.use(routeRegExp, ...handlers);
    }
    /**
     * Remove handlers from given path.
     * 
     * @param path Path or regex
     * @param handlers Handlers to unregister
     */
    public remove(path: string | RegExp, ...handlers: RouteHandler[]): BaseRouter {
        const routeRegExp = typeof path === "string" ? createRouteRegExp(path) : path;
        return this.unuse(routeRegExp, ...handlers);
    }

    /**
     * Register handlers that are executed when no route is found.
     * 
     * @param handlers Middlewares and route config to use when no route is found
     */
    public none(...handlers: RouteHandler[]): BaseRouter {
        const route = this.routes.none;
        if (route.handlers[0] === baseNotFound) {
            route.handlers = handlers;
        }
        else {
            push.apply(route.handlers, handlers);
        }

        return this;
    }

    /** Start listening for URL changes. */
    public start(): BaseRouter {
        let current = null as string | null | undefined

        const delay = (): void => {
            this.timeout = setTimeout(handle, 50); // eslint-disable-line
        };

        const handle = (): void => {
            if (BaseRouter.skip) {
                BaseRouter.skip = false;
                current = this._current;
                return delay();
            }

            const f = this.getFragment();
            if (current !== f) {
                current = f;
                this.handle(f).then(delay, delay);
            }
            else {
                delay();
            }
        };

        this.stop();
        delay();

        return this;
    }
    /** Stop listening for route changes */
    public stop(): BaseRouter {
        clearInterval(this.timeout);
        return this;
    }

    /** Stop and clear all configs. */
    public clear(): BaseRouter {
        this.stop();
        this.routes = {
            none: { matcher: null, handlers: [baseNotFound] }
        };
        this.mode = "hash";
        this.root = "";

        return this;
    }

    /**
     * Navigate to the given path.
     * 
     * @param path Path to navigate to (/ if empty)
     */
    public navigate(path?: string): BaseRouter {
        path = this.root + normalizeRoute(path);
        BaseRouter.skip = false;

        if (hasHistory) {
            history.pushState(null, null as any, this.mode === "history" ? path : "#" + path);
        }
        else {
            location.hash = "#" + path;
        }

        return this;
    }

    /**
     * Replace the current path with the given one.
     * 
     * @param path Path to navigate to (/ if empty)
     * @param skipHandling true to avoid handling the new path
     */
    public replace(path?: string, skipHandling?: boolean): BaseRouter {
        path = this.root + normalizeRoute(path);
        BaseRouter.skip = skipHandling || false;

        if (hasHistory) {
            history.replaceState(null, null as any, this.mode === "history" ? path : "#" + path);
        }
        else {
            location.hash = "#" + path;
        }

        return this;
    }

    /**
     * Manually handle the given route.
     * 
     * @param fragment Fragment to handle (current path if not specifed)
     */
    public handle(fragment: string | null = this.getFragment()): Promise<BaseRouter> {
        if (fragment === null) {
            return Promise.resolve(this);
        }

        let handlers: RouteHandler[] = [];

        Object.keys(this.routes).forEach(routeId => {
            const route = this.routes[routeId];
            if (!route.matcher) return;

            const match = fragment.match(route.matcher);
            if (match) {
                handlers.push(executeHandlers.bind(this, this.routes[routeId].handlers, slice.call(match, 1)));
            }
        });

        if (handlers.length === 0) {
            handlers = this.routes.none.handlers;
        }

        return executeHandlers(handlers)
            .catch(this.onError.bind(this))
            .then(() => {
                this._current = fragment;
                return this;
            });
    }

    /** Get current fragment path. */
    public getFragment(): string | null {
        let fragment = this.mode === "history" ? location.pathname : location.hash;
        fragment = normalizeRoute(fragment);

        if (this.root === "") {
            return fragment;
        }

        if (this.rootRegExp && this.rootRegExp.test(fragment)) {
            return fragment.replace(this.rootRegExp, "");
        }

        return null;
    }

    /** Allows to override the error handling. */
    protected onError(err: Error): void {
        console.log("err", err);
        const onErr = this._onError || baseOnError;
        return onErr.call(this, err);
    }
}

//#region Private Methods

function createRouteConfig(args: IArguments): Route & { matcher: RegExp } {
    const arg = args[0];
    let i = 0,
        routeRegExp: RegExp;

    if (typeof arg === "function") {
        routeRegExp = /(.*)/;
    }
    else {
        routeRegExp = typeof arg === "string" ? createRouteRegExp(arg + "(*)") : arg;
        i = 1;
    }

    return {
        matcher: routeRegExp,
        handlers: slice.call(args, i)
    };
}

function normalizeRoute(path?: string): string {
    return String(path || "")
        .replace(/^#/, "")
        .replace(/\/$/, "")
        .replace(/^\//, "");
}
function createRouteRegExp(route: string): RegExp {
    route = normalizeRoute(route)
        .replace(/\*/g, () => ".*")
        .replace(/\?/g, () => "\\?")
        .replace(/\(([^)]+)\)/g, (_, t1) => {
            t1 = t1.replace(/:[a-zA-Z0-9]+/g, () => "([^\\/\\(\\)\\?]+?)");
            return `(?:${t1})?`;
        })
        .replace(/:[a-zA-Z0-9]+/g, () => "([^\\/\\(\\)\\?]+?)");

    return new RegExp("^" + route + "$");
}

function executeHandlers(_handlers: RouteHandler[], args: any[] = []): Promise<any> {
    const handlers = _handlers.slice();
    return next();

    function next(): Promise<boolean | void> {
        const handler = handlers.shift();
        if (!handler) {
            return Promise.resolve();
        }

        return Promise.resolve()
            .then(() => handler(...args))
            .then(res => {
                if (res === false) {
                    return false;
                }

                return next();
            });
    }
}

function baseNotFound(): any {
    throw new Error("Not Found");
}
function baseOnError(this: any, err: Error): never {
    system.error("router>", err);

    if (this._current) {
        this.replace(this._current, true);
    }

    throw err;
}

//#endregion

//#endregion

//#region Router Class

export interface ViewModelRoute extends composer.CompositionOptions {
    path: string | RegExp;
    href?: ko.MaybeSubscribable<string | null | undefined>;
    title?: ko.MaybeSubscribable<string | null | undefined>;
    visible?: ko.MaybeSubscribable<boolean | null | undefined>;
    handler?: RouteHandler;
}

export class Router extends BaseRouter {
    private routeHandlers: { [key: string]: ViewModelRoute } = {};

    public currentRoute = ko.observable<ViewModelRoute | null>();
    public currentViewModel = activator.createActivateObservable<ViewModel | null>();
    public isNavigating = ko.observable(false);

    public navigation = ko.pureComputed(() => {
        return Object.keys(this.routeHandlers)
            .map(key => this.routeHandlers[key])
            .filter(config => ko.unwrap(config.visible));
    });

    constructor(options?: Options) {
        super(options);
    }

    /**
     * Configure a route for a ViewModel.
     * 
     * @param config Configuration to register
     */
    public route(config: ViewModelRoute): Router {
        const
            handlerId = config.path.toString(),
            handler = createRouteHandler(this, config);

        config.handler = handler;

        if (!config.href && typeof config.path === "string") {
            config.href = (this.mode === "hash" ? "#" : "") + this.root + config.path;
        }

        this.routeHandlers[handlerId] = config;
        this.add(config.path, handler);

        return this;
    }
    /**
     * Unregister a route for a ViewModel
     * 
     * @param config Configuration to remove
     */
    public deroute(config: ViewModelRoute): Router {
        const
            handlerId = config.path.toString(),
            innerConfig = this.routeHandlers[handlerId];

        if (innerConfig && config.handler) {
            this.remove(innerConfig.path, config.handler);
            delete this.routeHandlers[handlerId];
        }

        return this;
    }
    /**
     * Register a ViewModel when no handlers match the current route.
     * 
     * @param config Configuration for the not found handler
     */
    public notFound(config: ViewModelRoute): Router {
        this.none(createRouteHandler(this, config));
        return this;
    }

    /**
     * Register a child router for the given prefix.
     * 
     * @param path Path prefix for the child router
     * @param childRouter Child router
     */
    public child(path: string, childRouter?: Router): Router {
        if (!childRouter) {
            childRouter = new Router({ mode: this.mode, root: path, onError: this.onError.bind(this) });
        }

        this.use(new RegExp("^" + path + "(?:/(.*))?$"), childRouter.handle.bind(childRouter));

        return childRouter;
    }

    /** Stop the router and clear all configs. */
    public clear(): Router {
        super.clear();
        this.routeHandlers = {};
        this.currentRoute(null);
        this.currentViewModel(null);

        return this;
    }

    /**
     * Manually handle the given fragment.
     * 
     * @param fragment URL fragment to handle (current fragment if empty)
     */
    public handle(fragment?: string): Promise<Router> {
        if (fragment === null) {
            return Promise.resolve(this);
        }

        this.isNavigating(true);

        return super.handle(fragment).then<any>(
            () => {
                this.isNavigating(false);
                return this;
            },
            err => {
                this.isNavigating(false);
                throw err;
            }
        );
    }
}

const rootRouter = new Router();
export default rootRouter;

function createRouteHandler(self: Router, route: ViewModelRoute): () => PromiseLike<void> {
    return function (...args: any[]) {
        const oldRoute = self.currentRoute();
        self.currentRoute(route);

        self.currentViewModel.args = args;
        self.currentViewModel(route.viewmodel);

        return self.currentViewModel.then(
            vm => {
                const title = vm && vm.title ? ko.unwrap(vm.title) : ko.unwrap(route.title);
                if (title) {
                    document.title = title;
                }
            },
            err => {
                self.currentRoute(oldRoute);
                throw err;
            }
        );
    };
}

//#endregion

//#region Router Handlers

ko.bindingHandlers["router"] = {
    init(element, valueAccessor) {
        let val = valueAccessor(),
            router: Router;

        if (val instanceof Router) {
            router = val;
        }
        else {
            val = typeof val === "object" ? val.router : val;
            router = val || rootRouter;
        }

        ko.computed({
            disposeWhenNodeIsRemoved: element,
            read: () => {
                const
                    config = router.currentRoute.peek(),
                    vm = router.currentViewModel();

                if (!config || !vm) {
                    return;
                }

                composer.compose(element, system.extend({}, config, { viewmodel: vm }))
                    .catch(system.error);
            }
        });

        return { controlsDescendantBindings: true };
    }
};

ko.virtualElements.allowedBindings["router"] = true;

ko.components.register("kospa-router", { template: `<!--ko router: $data--><!--/ko-->` });

declare module "knockout" {
    interface BindingHandlers {
        router: {
            init(element: Element, valueAccessor: () => Router | { router: Router } | undefined): BindingHandlerControlsDescendant;
        }
    }
}

//#endregion
