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
    private static skip: boolean = false;
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

    public use(...handlers: RouteHandler[]): BaseRouter;
    public use(path: string | RegExp, ...handlers: RouteHandler[]): BaseRouter;
    public use(): BaseRouter {
        const
            config = createRouteConfig(arguments),
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

    public unuse(...handlers: RouteHandler[]): BaseRouter;
    public unuse(path: string | RegExp, ...handlers: RouteHandler[]): BaseRouter;
    public unuse(): BaseRouter {
        const
            config = createRouteConfig(arguments),
            routeId = config.matcher.toString(),
            route = this.routes[routeId];

        if (route) {
            let handler: RouteHandler | undefined,
                index: number;

            while (handler = config.handlers.pop()) {
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

    public add(path: string | RegExp, ...handlers: RouteHandler[]): BaseRouter {
        const routeRegExp = typeof path === "string" ? createRouteRegExp(path) : path;
        return this.use(routeRegExp, ...handlers);
    }
    public remove(path: string | RegExp, ...handlers: RouteHandler[]): BaseRouter {
        const routeRegExp = typeof path === "string" ? createRouteRegExp(path) : path;
        return this.unuse(routeRegExp, ...handlers);
    }

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

    public start(): BaseRouter {
        let current = null as string | null | undefined,
            self = this;

        this.stop();
        delay();

        function delay() {
            self.timeout = setTimeout(handle, 50);
        }

        function handle() {
            if (BaseRouter.skip) {
                BaseRouter.skip = false;
                current = self._current;
                return delay();
            }

            const f = self.getFragment();
            if (current !== f) {
                current = f;
                self.handle(f).then(delay, delay);
            }
            else {
                delay();
            }
        }

        return this;
    }
    public stop(): BaseRouter {
        clearInterval(this.timeout);
        return this;
    }

    public clear(): BaseRouter {
        this.stop();
        this.routes = {
            none: { matcher: null, handlers: [baseNotFound] }
        };
        this.mode = "hash";
        this.root = "";

        return this;
    }

    public navigate(): BaseRouter;
    public navigate(path: string): BaseRouter;
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

    public replace(): BaseRouter;
    public replace(path: string): BaseRouter;
    public replace(path: string, skipHandling: boolean): BaseRouter;
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

    protected onError(err: any) {
        console.log("err", err);
        const onErr = this._onError || baseOnError;
        return onErr.call(this, err);
    }
}

//#region Private Methods

function createRouteConfig(args: IArguments): Route & { matcher: RegExp } {
    let i = 0,
        arg = args[0],
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
        .replace(/\(([^\)]+)\)/g, (_, t1) => {
            t1 = t1.replace(/:[a-zA-Z0-9]+/g, () => "([^\\/\\(\\)\\?]+?)");
            return `(?:${t1})?`;
        })
        .replace(/:[a-zA-Z0-9]+/g, () => "([^\\/\\(\\)\\?]+?)");

    return new RegExp("^" + route + "$");
}

function executeHandlers(handlers: RouteHandler[], args: any[] = []): Promise<any> {
    let p = Promise.resolve(),
        i = 0, len = handlers.length;

    for (; i < len; i++) {
        p = p.then(executeHandler.bind(null, handlers[i], args));
    }

    return p;
}
function executeHandler(handler: RouteHandler, args: any[]): any {
    return handler.apply(null, args);
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
    public notFound(config: ViewModelRoute): Router {
        this.none(createRouteHandler(this, config));
        return this;
    }

    public child(path: string, childRouter?: Router): Router {
        if (!childRouter) {
            childRouter = new Router({ mode: this.mode, root: path, onError: this.onError.bind(this) });
        }

        this.use(new RegExp("^" + path + "(?:/(.*))?$"), childRouter.handle.bind(childRouter));

        return childRouter;
    }

    public clear(): Router {
        super.clear();
        this.routeHandlers = {};
        this.currentRoute(null);
        this.currentViewModel(null);

        return this;
    }

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
    return function () {
        const oldRoute = self.currentRoute();
        self.currentRoute(route);

        self.currentViewModel.args = slice.call(arguments);
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
