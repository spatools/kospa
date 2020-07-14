﻿import * as loader from "./loader";

export interface Extend {
    <T, U>(target: T, source: U): T & U;
    <T, U, V>(target: T, source1: U, source2: V): T & U & V;
    <T, U, V, W>(target: T, source1: U, source2: V, source3: W): T & U & V & W;
    (target: Record<string, unknown>, ...sources: any[]): any;
}

export interface Deferred<T> {
    promise: Promise<T>;
    resolve(val?: T): void;
    reject(err: Error): void;
}

let _enableLog = true;

export function enableLog(enable: boolean): void {
    _enableLog = enable;
}

export function log(...args: any[]): void {
    if (_enableLog) {
        console.log(...args);
    }
}

export function error(...args: any[]): void {
    if (_enableLog) {
        console.error(...args);
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

        const T = Object(target);
        const l = arguments.length;
        let i = 1;
        let S: Record<string, unknown>;

        while (l > i) {
            S = Object(arguments[i++]); // eslint-disable-line
            Object.keys(S).forEach(assignKey, S);
        }

        return T;

        function assignKey(this: any, key: string): void {
            T[key] = this[key];
        }
    };
})(Object) as Extend;

export function module<T>(): Promise<null>;
export function module<T>(name: string): Promise<T>;
export function module<T>(names: string[]): Promise<T[]>;
export function module<T>(...names: string[]): Promise<T[]>;
export function module<T>(): Promise<T | T[] | null> {
    let args = Array.prototype.slice.call(arguments); // eslint-disable-line
    if (args.length === 0) {
        return Promise.resolve(null);
    }

    if (args.length === 1 && Array.isArray(args[0])) {
        args = args[0];
    }

    if (args.length === 1) {
        return loader.loadModule(args[0]);
    }

    return Promise.all(args.map(loader.loadModule));
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
