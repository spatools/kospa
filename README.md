# kospa (Knockout Single-Page Application)

`kospa` is a lightweight and modular framework built on top of Knockout.JS to build powerful Single Page Applications.

## Packages

 - `@kospa/base`: Base components (composition, activation, module loading)
 - `@kospa/router`: Router component
 - `@kospa/dialog`: Dialog component
 - `@kospa/engine`: Knockout module-based Template Engine
 - `@kospa/bootstrap`: Application startup component

## Core concept

 - **Composition:** a process that loads a ViewModel and a View using a module loader and bind them in the DOM.
 - **Activation:** a process that loads, activate and deactivate a ViewModel module.

## Lifecycle

ViewModels in kospa follows the following lifecycle:
 1. `activate`: Load data and initialize the ViewModel before binding it to the DOM.
 2. `bindingComplete`: Run after the ViewModel is bound to the DOM.
 3. `descendantsComplete`: Run after all asynchronous binding are applied to the DOM.
 4. `compositionComplete`: Run when the composition process is complete.
 5. `deactivate`: Run when the ViewModel is unbound from the DOM.
 6. `dispose`: Run before the DOM node is removed.

## License

This project is under MIT License. See the [LICENSE](LICENSE) file for the full license text.
