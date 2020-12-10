import * as ko from "knockout";
import * as system from "@kospa/base/system";

const
    SOURCE_REGEXP = /^text!(.+)/,
    sources: { [key: string]: ModuleSource } = {};

//#region Module Template Source

export interface ModuleTemplateObservable extends ko.Observable<string> {
    data: any;
}

export interface ModuleSourceOptions {
    loadingTemplate?: string;
    afterRender?: (...args: any[]) => any;
}

export class ModuleSource {
    public name: string;
    public template: ModuleTemplateObservable;
    public isLoading = false;
    public isLoaded = false;

    constructor(
        public source: string,
        public options: ModuleSourceOptions = {}) {
        if (typeof source !== "string") {
            throw new Error("Module Template Source need string template source");
        }

        const nameMatch = source.match(SOURCE_REGEXP);
        if (!nameMatch) {
            throw new Error("Module Template Source is not valid!");
        }

        this.name = nameMatch[1];

        const tmpl: any = ko.observable(this.options.loadingTemplate || ModuleEngine.defaults.loading);
        tmpl.data = {};

        this.template = tmpl;

        if (options.afterRender) {
            const origAfterRender = options.afterRender;

            this.options.afterRender = (...args: any[]) => {
                if (this.isLoaded) {
                    origAfterRender.apply(this.options, args);
                }
            };
        }
    }

    public static isModuleTemplateSource(value: string): boolean {
        return SOURCE_REGEXP.test(value);
    }

    public text(): string;
    public text(value: string): void;
    public text(value?: string): any {
        if (!this.isLoaded)
            this.loadTemplate();

        if (arguments.length === 0) {
            return this.template();
        }
        else {
            this.template(value as string);
        }
    }

    public data(key: string): any;
    public data(key: string, value: unknown): void;
    public data(key: string, value?: unknown): any {
        if (arguments.length === 1) {
            if (key === "precompiled")
                this.template(); // register observable for auto template refresh

            return this.template.data[key];
        }

        this.template.data[key] = value;
    }

    public nodes(): Element;
    public nodes(element: Element): void;
    public nodes(element?: Element): any {
        if (arguments.length === 0) {
            const markup = this.text(); // to register dependency
            if (!this.template.data.__NODES__) {
                this.template.data.__NODES__ = parseMarkup(markup);
            }

            return this.template.data.__NODES__;
        }
        else {
            this.template.data.__NODES__ = element as Element;
        }
    }

    public loadTemplate(): void {
        if (this.isLoading) {
            return;
        }

        this.isLoading = true;
        system.module<string>(this.source)
            .then(template => {
                this.data("precompiled", null);

                this.isLoaded = true;
                this.isLoading = false;
                this.template.data.__NODES__ = null;

                this.template(template);
            });
    }

    public static create(source: string, options?: ModuleSourceOptions): ModuleSource {
        if (sources[source]) {
            return sources[source];
        }

        const src = new ModuleSource(source, options);
        sources[source] = src;

        return src;
    }
}

ko.templateSources["module"] = ModuleSource;

declare module "knockout" {
    // eslint-disable-next-line
    export namespace templateSources {
        export let module: typeof ModuleSource;
    }
}

//#endregion

//#region Module Template Engine

export interface ModuleEngineDefault {
    loading: string;
    engine: {
        new(): ko.templateEngine;
        prototype: ko.templateEngine;
    };
}

export class ModuleEngine extends ko.templateEngine {
    public allowTemplateRewriting = false;
    private _innerEngine: ko.templateEngine;

    public static defaults: ModuleEngineDefault = {
        loading: `<div class="template-loading"></div>`,
        engine: ko.nativeTemplateEngine as any
    };

    constructor();
    constructor(innerEngine: ko.templateEngine);
    constructor(innerEngine?: ko.templateEngine) {
        super();
        this._innerEngine = innerEngine || new ModuleEngine.defaults.engine();
    }

    public makeTemplateSource(template: string | Node, templateDocument: Document, options?: ModuleSourceOptions): any {
        // Module template
        if (typeof template === "string" && ModuleSource.isModuleTemplateSource(template)) {
            return ko.templateSources["module"].create(template, options);
        }

        // Call base method
        return this._innerEngine.makeTemplateSource.call(this._innerEngine, template, templateDocument);
    }

    public renderTemplateSource(templateSource: ko.TemplateSource, bindingContext: ko.BindingContext<any>, options: ko.TemplateOptions<any>, templateDocument?: Document): any {
        return this._innerEngine.renderTemplateSource(templateSource, bindingContext, options, templateDocument);
    }

    public renderTemplate(template: string | Node, bindingContext: ko.BindingContext<any>, options: ModuleSourceOptions, templateDocument: Document): any {
        const templateSource = this.makeTemplateSource(template, templateDocument, options);
        return this.renderTemplateSource(templateSource, bindingContext, options);
    }
}

(ko as any)["moduleTemplateEngine"] = ModuleEngine;

declare module "knockout" {
    export let moduleTemplateEngine: typeof ModuleEngine;
}

//#endregion

//#region Public Base Members

const defaultInstance = new ModuleEngine();

/** Set ModuleEngine as default Knockout Template Engine using the Knockout Native Template Engine to process Module.JS Templates. */
export function setTemplateEngine(): void;

/**
 * Set ModuleEngine as default Knockout Template Engine.
 * @param innerEngine - Inner Engine to use to process Module.JS Templates.
 */
export function setTemplateEngine(innerEngine: ko.templateEngine): void;

export function setTemplateEngine(innerEngine?: ko.templateEngine): void {
    ko.setTemplateEngine(innerEngine ? new ModuleEngine(innerEngine) : defaultInstance);
}

/**
 * Init Method for boostrap module.
 * It installs ModuleEngine as default Knockout Template Engine.
 */
export function init(): void {
    setTemplateEngine();
}

export default defaultInstance;

//#endregion

function parseMarkup(markup: string): Element {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${markup}</div>`, "text/html");
    return doc.body.children[0];
}
