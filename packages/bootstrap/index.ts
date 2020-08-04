import * as system from "@kospa/base/system";
import * as composer from "@kospa/base/composer";

export type InitializeHandler = () => PromiseLike<any> | any;
export type InitializeModule = { init: InitializeHandler; };

export interface StartOptions extends composer.CompositionOptions {
    container?: string | Node;
}

/**
 * Initialize given module and compose the global application container.
 * 
 * @param options Specify the composition options for the global application container.
 * @param handlersOrModules Handlers or modules to initialize during startup:
 *                          If a string: load module and initialize it (wait for Promise resolution ) ;
 *                          If an object with a init function: run the init function and wait for Promise resolution  ;
 *                          If a function: run the function and wait for Promise resolution ;
 *                          If a Promise: wait for Promise resolution.
 */
export function start(options: StartOptions, ...handlersOrModules: Array<string | InitializeModule | InitializeHandler | PromiseLike<any>>): Promise<Node> {

    return system.asyncEach(handlersOrModules, handlerOrModule => {
        if (typeof handlerOrModule === "string") {
            return system.module<InitializeModule>(handlerOrModule).then(initModule);
        }
        else if (isPromiseLike(handlerOrModule)) {
            return handlerOrModule;
        }
        else if (isInitializeModule(handlerOrModule)) {
            return initModule(handlerOrModule);
        }
        else if (typeof handlerOrModule === "function") {
            return handlerOrModule();
        }
        else {
            return Promise.resolve(handlerOrModule);
        }
    }).then(() => compose(options));
}

function compose(options: StartOptions): Promise<Node> {
    if (!options.container) {
        options.container = "main";
    }

    if (typeof options.activate === "undefined") {
        options.activate = true;
    }

    return composer.compose(options.container, options);
}

function initModule(mod: InitializeModule): void | Promise<any> {
    if (isInitializeModule(mod)) {
        return Promise.resolve(mod.init());
    }
}

function isPromiseLike(obj: any): obj is PromiseLike<any> {
    return obj && typeof obj.then === "function";
}

function isInitializeModule(obj: any): obj is InitializeModule {
    return obj && typeof obj.init === "function";
}
