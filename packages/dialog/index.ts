import * as ko from "knockout";
import * as activator from "@kospa/base/activator";
import * as composer from "@kospa/base/composer";
import { extend, deferred, Deferred } from "@kospa/base/system";

let undef: undefined;

export interface DialogDefaults {
    id?: string;
    template?: string;
    modal?: boolean;
    container?: string | Node;
    activate?: boolean;
    title?: string;

    create?: (opts: DialogOptions) => Node | PromiseLike<Node>;
    after?: (node: Node, opts: DialogOptions) => void | PromiseLike<void>;
    close?: (opts: DialogOptions) => void | PromiseLike<void>;
}

export interface DialogOptions extends DialogDefaults, composer.CompositionOptions {
    /** SYSTEM ONLY */
    __dfd?: Deferred<any>;
}

type SafeDialogOptions = DialogOptions & Required<Pick<DialogOptions, "id" | "container" | "activate" | "create" | "close" | "__dfd">>;

const
    doc = document,
    opened: Record<string, SafeDialogOptions> = {};

export const defaults: DialogDefaults = {
    container: defaultContainer(),
    activate: true,

    create: defaultCreate,
    close: defaultClose
};

export function open(options: DialogOptions): Promise<any>;
export function open<T>(options: DialogOptions): Promise<T>;
export function open<T>(options: DialogOptions): Promise<T> {
    const
        opts = extend({}, defaults, options) as SafeDialogOptions;

    return Promise.resolve(opts.create(opts))
        .then(container => compose(container, opts))
        .then(node => opts.after && opts.after(node, opts))
        .then(() => {
            opts.__dfd = deferred();

            opened[opts.id] = opts;
            (<any>opts.viewmodel).dialogId = opts.id;

            return opts.__dfd.promise;
        });
}

export function close(id: string, result?: unknown): Promise<void> {
    const opts = opened[id];

    if (!opts) {
        return Promise.resolve<void>(undef);
    }

    return activator.deactivate(opts.viewmodel as activator.ViewModel)
        .then(() => opts.close(opts))
        .then(() => {
            opts.__dfd.resolve(result);

            delete (<any>opts.viewmodel).dialogId;
            delete opened[opts.id];
        });
}

function compose(container: Node, options: DialogOptions): Promise<Node> {
    if (options.template) {
        return composer.compose(container, {
            viewmodel: TemplateViewModel,
            view: options.template,
            activate: options.activate,
            args: [options]
        });
    }

    return composer.compose(container, options);
}

let zIndex = 10000;
function defaultCreate(options: DialogOptions): Node {
    const
        dialog = doc.createElement("div"),
        global = ensureGlobalContainer(options.container);

    if (!options.id) {
        options.id = generateId();
    }

    dialog.id = options.id;
    dialog.classList.add("kospa-dialog");
    dialog.style.zIndex = String(zIndex++);

    global.appendChild(dialog);

    return dialog;
}

function defaultClose(options: DialogOptions): void {
    const
        container = options.container as Node,
        dialog = doc.getElementById(options.id as string);

    if (!dialog) return;

    container.removeChild(dialog);
    zIndex--;
}

function defaultContainer(): HTMLElement {
    const div = doc.createElement("div");
    div.id = "kospa-dialogs-container";

    return div;
}

function ensureGlobalContainer(container: string | Node | null | undefined): Node {
    const globalContainer =
        typeof container === "string" ?
            doc.getElementById(container) :
            container;

    if (!globalContainer) {
        throw new TypeError("Container should exists!");
    }

    if (globalContainer.parentElement === null) {
        doc.body.appendChild(globalContainer);
    }

    return globalContainer;
}

function generateId(): string {
    return Math.round(Math.random() * 100000000).toString(36);
}

class TemplateViewModel {
    private id?: string;
    private _title?: string;

    public viewmodel = ko.observable<any>();

    public title = ko.pureComputed<string>(() => {
        const vm = this.viewmodel();
        return vm && ko.unwrap(vm.title) || this._title;
    }, this);

    public close(): void {
        if (this.id) {
            close(this.id);
        }
    }

    public activate(options: DialogOptions): void {
        this.id = options.id;
        this._title = options.title;
    }

    public descendantsComplete(container: HTMLElement, options: DialogOptions): void | Promise<void> {
        const node = container.getElementsByTagName("dialog-content")[0];
        if (node) {
            return composer.compose(node, options)
                .then(() => { this.viewmodel(options.viewmodel); });
        }
    }
}