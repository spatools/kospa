/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-var-requires */
export type ModuleLocator = (module: string) => string;
export type ViewLocator = (view: string) => string;
export type ModuleLoader = (module: string) => Promise<any>;
export type ViewLoader = (view: string) => Promise<string>;

// @ts-ignore
const IS_AMD = (typeof define === "function" && define.amd);
// @ts-ignore
const IS_COMMONJS = (typeof module === "object" && module.exports);
// @ts-ignore
const IS_SYSTEMJS = (typeof System === "object" && typeof System.import === "function");

export let moduleLocator: ModuleLocator = defaultModuleLocator;
export let viewLocator: ViewLocator = defaultViewLocator;
export let moduleLoader: ModuleLoader = defaultModuleLoader;
export let viewLoader: ViewLoader = defaultViewLoader;

export function loadModule<T = any>(module: string): Promise<T> {
    return moduleLoader(moduleLocator(module));
}

export function loadView(view: string): Promise<string> {
    return viewLoader(viewLocator(view));
}

export function setModuleLocator(locator: ModuleLocator): void {
    moduleLocator = locator;
}

export function setViewLocator(locator: ViewLocator): void {
    viewLocator = locator;
}

export function setModuleLoader(loader: ModuleLoader): void {
    moduleLoader = loader;
}

export function setViewLoader(loader: ViewLoader): void {
    viewLoader = loader;
}

function defaultModuleLocator(module: string): string {
    return module;
}

function defaultViewLocator(view: string): string {
    if (IS_AMD) {
        return "text!" + addHTMLExtension(view);
    } else if (IS_COMMONJS) {
        return view;
    } else if (IS_SYSTEMJS) {
        return addHTMLExtension(view) + "!text";
    } else {
        throw new TypeError("No import mecanism available!");
    }
}

function defaultModuleLoader(module: string): Promise<any> {
    if (IS_AMD) {
        return importAMD(module);
    } else if (IS_COMMONJS) {
        return importCommonJS(module);
    } else if (IS_SYSTEMJS) {
        return importSystemJS(module);
    } else {
        return Promise.reject(new TypeError("No import mecanism available!"));
    }
}

function defaultViewLoader(view: string): Promise<string> {
    return defaultModuleLoader(view)
        .then(res => {
            if (IS_COMMONJS) {
                return res.view || res.default;
            }

            return res;
        });
}

function importAMD(module: string): Promise<any> {
    return new Promise<any>((resolve, reject) => {
        try {
            // @ts-ignore
            require([module], ([mod]: any[]) => { resolve(mod); }, (err: Error) => { reject(err); });
        }
        catch (e) {
            reject(e);
        }
    });
}

function importCommonJS(module: string): Promise<any> {
    return new Promise<any>((resolve, reject) => {
        try {
            // @ts-ignore
            resolve(require(module));
        }
        catch (e) {
            reject(e);
        }
    });
}

function importSystemJS(module: string): Promise<any> {
    // @ts-ignore
    return System.import(module);
}

function addHTMLExtension(path: string): string {
    return path + (/\.html$/.test(path) ? "" : ".html");
}
