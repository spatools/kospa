﻿export interface Extend {
    <T, U>(target: T, source: U): T & U;
    <T, U, V>(target: T, source1: U, source2: V): T & U & V;
    <T, U, V, W>(target: T, source1: U, source2: V, source3: W): T & U & V & W;
    (target: object, ...sources: any[]): any;
}

export interface Deferred<T> {
    promise: Promise<T>;
    resolve(val?: T): void;
    reject(err: Error): void;
}

export let enableLog = true;

export function log(...args: any[]): void;
export function log(): void {
    if (enableLog) {
        console.log.apply(console, <any>arguments);
    }
}

export function error(...args: any[]): void;
export function error(): void {
    if (enableLog) {
        console.error.apply(console, <any>arguments);
    }
}

export const extend = (function (Obj: any) {
    if ("assign" in Obj) {
        return Obj.assign;
    }

    return function assign(target: any): any {
        if (typeof target === "undefined") {
            throw new Error("Please specify a target object");
        }

        var T = Object(target),
            l = arguments.length,
            i = 1, S;

        function assignKey(this: any, key: string): void {
            T[key] = this[key];
        }

        while (l > i) {
            S = Object(arguments[i++]);
            Object.keys(S).forEach(assignKey, S);
        }

        return T;
    };
})(Object) as Extend;

export function module<T>(): Promise<null>;
export function module<T>(name: string): Promise<T>;
export function module<T>(names: string[]): Promise<T[]>;
export function module<T>(...names: string[]): Promise<T[]>;
export function module<T>(): Promise<T | T[] | null> {
    var args = Array.prototype.slice.call(arguments);
    if (args.length === 0) {
        return Promise.resolve(null);
    }

    return new Promise<any>((resolve, reject) => {
        if (args.length === 1 && Array.isArray(args[0])) {
            args = args[0];
        }

        try {
            require(
                args,
                (...mods: any[]) => { resolve(mods.length === 1 ? mods[0] : mods); },
                (err: Error) => { reject(err); }
            );
        }
        catch (e) {
            reject(e);
        }
    });
}

export function deferred(): Deferred<any>;
export function deferred<T>(): Deferred<T>;
export function deferred<T>(): Deferred<T> {
    const defer = {
        resolve: null,
        reject: null,
        promise: null
    } as any;

    defer.promise = new Promise((resolve, reject) => {
        defer.resolve = resolve;
        defer.reject = reject;
    });

    return defer;
}

export function asyncEach<T>(array: T[], iterator: (item: T, index: number, list: T[]) => Promise<any>): Promise<void> {
    return array.reduce(
        (prom, value, index, list) => prom.then(() => iterator(value, index, list)),
        Promise.resolve()
    );
}
