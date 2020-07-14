import * as ko from "knockout";
import * as loader from "./loader";
import * as system from "./system";
import * as activator from "./activator";

export type View = activator.View;
export type ViewModel = activator.ViewModel;
export type ViewModelConstructor = activator.ViewModelConstructor;
export type ViewModelOrConstructor = activator.ViewModelOrConstructor;

const VIEW_CACHE = {} as Record<string, Node[]>;

//#region Composition

export interface CompositionOptions {
    viewmodel: string | ViewModelOrConstructor;
    view?: View | null;
    args?: any[];
    activate?: boolean;

    bindingComplete?(node: Node, vm: ViewModel, ...args: any[]): void | Promise<any>;
    descendantsComplete?(node: Node, vm: ViewModel, ...args: any[]): void | Promise<any>;
    compositionComplete?(vm: ViewModel, ...args: any[]): void | Promise<any>;
}

export class CompositionError extends Error {
    constructor(
        public vm: string | ViewModelOrConstructor,
        public innerError?: string | Error
    ) {
        super(`composer: ${innerError ? innerError : "Unknown"}`);

        if (innerError && typeof (<any>innerError).stack !== "undefined") {
            Object.defineProperty(this, "stack", { get: () => (<any>innerError).stack });
        }
    }
}

/**
 * Compose a ViewModel and a View into an element using Require.JS.
 * @param element - HTMLElement to compose on or its ID.
 * @param options - Composition Options.
 */
export function compose(element: string | Node, options: CompositionOptions): Promise<Node> {
    const
        node = typeof element === "string" ?
            document.getElementById(element) :
            element;

    if (!node) {
        throw new CompositionError(options.viewmodel, `Can't find element: ${element}`);
    }

    return loadComponents(options)
        .then(options => activation(node, options))
        .catch(err => {
            if (err instanceof CompositionError) {
                throw err;
            }

            throw new CompositionError(options.viewmodel, err);
        })
        .then(() => node);
}

//#endregion

//#region Knockout Handlers

ko.bindingHandlers["compose"] = {
    init() {
        return { controlsDescendantBindings: true };
    },
    update(element: Node, valueAccessor) {
        compose(element, ko.toJS(valueAccessor()) as CompositionOptions)
            .catch(system.error);
    }
};

ko.virtualElements.allowedBindings["compose"] = true;

ko.components.register("kospa-compose", { template: `<!--ko compose: $data--><!--/ko-->` });

//#endregion

//#region Loading Methods

function loadComponents(options: CompositionOptions): Promise<CompositionLoadedOptions> {
    if (typeof options.viewmodel === "string" && !options.view) {
        options.view = options.viewmodel;
    }

    return loadViewModel(options.viewmodel)
        .then(vm => {
            if (!vm) {
                throw new CompositionError(options.viewmodel, "ViewModel module can't be empty!");
            }

            options.viewmodel = vm;
        })
        .then(() => loadView(options.view, options.viewmodel as ViewModelOrConstructor, options.args))
        .then(view => { options.view = view; })
        .then(() => options as CompositionLoadedOptions);
}

function loadViewModel(viewmodel: string | ViewModelOrConstructor): Promise<ViewModelOrConstructor> {
    return typeof viewmodel === "string" ?
        loader.loadModule<ViewModelOrConstructor>(viewmodel) :
        Promise.resolve(viewmodel);
}

function loadView(view: View | undefined | null, vm: ViewModelOrConstructor, args?: any[]): Promise<Node[]> {
    if (vm && typeof vm.getView === "function") {
        view = vm.getView(...(args || [])) || view;
    }

    if (!view) {
        return Promise.reject(new CompositionError(vm, "No view is provided!"));
    }

    return parseView(view);
}

function parseView(view: View): Promise<Node[]> {
    if (typeof view === "string") {
        if (VIEW_CACHE[view]) {
            return Promise.resolve(VIEW_CACHE[view]);
        }

        if (view.indexOf("<") === -1) {
            return loader.loadView(view)
                .then(tpl => parseView(tpl))
                .then(tpl => VIEW_CACHE[view] = tpl)
        }

        return Promise.resolve(ko.utils.parseHtmlFragment(view))
            .then(tpl => VIEW_CACHE[view] = tpl);

    }

    if (Array.isArray(view)) {
        return Promise.resolve(view);
    }

    if (isDocumentFragment(view)) {
        return Promise.resolve(
            arrayFromNodeList(view.childNodes)
        );
    }

    throw new Error(`Unknown view value: ${view}`);
}

//#endregion

//#region Activation Methods

function activation(node: Node, options: CompositionLoadedOptions): Promise<void> {
    if (!options.activate) {
        const
            oldVm = ko.utils.domData.get<ViewModel>(node, "kospa_vm"),
            vm = activator.constructs(options.viewmodel);

        return applyBindings(node, oldVm, vm, options);
    }

    return deactivateNode(node, options.viewmodel)
        .then(oldVm => activateNode(node, oldVm, options));
}

function activateNode(node: Node, oldVm: ViewModel | null | undefined, options: CompositionLoadedOptions): Promise<void> {
    return activator.activate(options.viewmodel, options.args)
        .then(vm => applyBindings(node, oldVm, vm, options));
}

function deactivateNode(node: Node, newVm: ViewModelOrConstructor): Promise<ViewModel | null | undefined> {
    const oldVm = ko.utils.domData.get<ViewModel>(node, "kospa_vm");
    return activator.deactivate(oldVm, newVm as ViewModel);
}

//#endregion

//#region Binding Methods

function applyBindings(node: Node, oldVm: ViewModel | null | undefined, vm: ViewModel, options: CompositionLoadedOptions): Promise<void> {
    if (oldVm === vm) {
        return Promise.resolve();
    }

    if (!oldVm) {
        ko.utils.domNodeDisposal.addDisposeCallback(node, dispose);
    }

    clean(node);
    moveNodes(options.view, node);

    const sub = ko.bindingEvent.subscribe(node, "descendantsComplete", descendantsComplete.bind(null, node, vm, options), vm);
    ko.utils.domData.set(node, "kospa_complete", sub);

    ko.applyBindingsToDescendants(vm, node);
    ko.utils.domData.set(node, "kospa_vm", vm);

    return bindingComplete(node, vm, options);
}

function dispose(node: Node): void {
    const sub = ko.utils.domData.get<ko.Subscription>(node, "kospa_complete");
    if (sub) sub.dispose();

    const vm = ko.utils.domData.get<ViewModel>(node, "kospa_vm");
    if (!vm) return;

    activator.deactivate(vm);
    activator.call(vm, "dispose");
}

function clean(node: Node): void {
    ko.virtualElements.emptyNode(node);
}

function moveNodes(nodes: Node[], dest: Node): void {
    ko.virtualElements.setDomNodeChildren(
        dest,
        cloneNodes(nodes)
    );
}

function cloneNodes(nodes: Node[]): Node[] {
    return nodes.map(node => node.cloneNode(true));
}

function arrayFromNodeList(nodes: Node[] | NodeList): Node[] {
    return Array.prototype.slice.call(nodes);
}

function isDocumentFragment(obj: any): obj is DocumentFragment {
    return typeof DocumentFragment !== "undefined" ?
        obj instanceof DocumentFragment :
        obj && obj.nodeType === 11;
}

//#endregion

//#region Callback Methods

function descendantsComplete(node: Node, vm: ViewModel, options: CompositionOptions): Promise<void> {
    const sub = ko.utils.domData.get<ko.Subscription>(node, "kospa_complete");
    if (sub) sub.dispose();

    const args = options.args || [];
    return Promise.all([
        activator.call(vm, "descendantsComplete", node, ...args),
        activator.call(options, "descendantsComplete", node, vm, ...args)
    ]).then(() => compositionComplete(vm, options));
}

function bindingComplete(node: Node, vm: ViewModel, options: CompositionOptions): Promise<void> {
    const args = options.args || [];
    return Promise.all([
        activator.call(vm, "bindingComplete", node, ...args),
        activator.call(options, "bindingComplete", node, vm, ...args)
    ]).then(() => void 0);
}

function compositionComplete(vm: ViewModel, options: CompositionOptions): Promise<void> {
    const args = options.args || [];
    return Promise.all([
        activator.call(vm, "compositionComplete", ...args),
        activator.call(options, "compositionComplete", vm, ...args)
    ]).then(() => void 0);
}

//#endregion

interface CompositionLoadedOptions extends CompositionOptions {
    viewmodel: ViewModelOrConstructor;
    view: Node[];
}

declare module "knockout" {
    interface BindingHandlers {
        compose: {
            init(): BindingHandlerControlsDescendant;
            update(element: Node, valueAccessor: () => MaybeSubscribable<CompositionOptions>): void;
        };
    }
}
