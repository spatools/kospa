/** AMD */
declare function require(modules: string[], onLoad?: (...modules: any[]) => void, onError?: (err: Error) => void): void;
declare function define(deps: string[], factory: Function): void;
declare namespace define {
    export const amd: true;
}

/** CommonJS */
declare function require(module: string): any;
declare namespace module {
    export const exports: {};
}

/** System.js */
declare const System: {
    import(module: string): Promise<any>;
};


