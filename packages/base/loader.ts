export function loadModule<T = any>(module: string): Promise<T> {

}

export function loadView(view: string): Promise<string> {

}

function importBase(module: string): Promise<any> {
    if (typeof define === "function" && define.amd) {
        return importAMD(module);
    } else if (typeof module === "object" && (module as any).exports) {
        return importCommonJS(module);
    } else if (typeof System === "object" && typeof System.import === "function") {
        return importSystemJS(module);
    } else {
        return Promise.reject(new TypeError("No import mecanism available!"));
    }
}

function importAMD(module: string): Promise<any> {
    return new Promise<any>((resolve, reject) => {
        try {
            require(
                [module],
                (...mods: any[]) => { resolve(mods[0]); },
                (err: Error) => { reject(err); }
            );
        }
        catch (e) {
            reject(e);
        }
    });
}

function importCommonJS(module: string): Promise<any> {
    return new Promise<any>((resolve, reject) => {
        try {
            resolve(require(module));
        }
        catch (e) {
            reject(e);
        }
    });
}

function importSystemJS(module: string): Promise<any> {
    return System.import(module);
}
