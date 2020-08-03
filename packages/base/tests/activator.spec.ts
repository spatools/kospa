import * as activator from "../activator";

describe("activator", () => {

    describe(".constructs()", () => {

        test("should return the given argument if it's an object", () => {
            const expected = {};
            const result = activator.constructs(expected);

            expect(result).toBe(expected);
        });

        test("should construct an instance if it's a constructor", () => {
            class MyClass { }
            const result = activator.constructs(MyClass);

            expect(result).toBeInstanceOf(MyClass);
        });

    });

    describe(".activate()", () => {

        test("should construct an instance if it's a constructor", async () => {
            class MyClass { }
            const result = await activator.activate(MyClass);

            expect(result).toBeInstanceOf(MyClass);
        });

        test("should call activate function on the ViewModel if available", async () => {
            const vm = { activate: jest.fn() };
            await activator.activate(vm);

            expect(vm.activate).toBeCalledTimes(1);
        });

        test("should wait for resolution if activate function on the ViewModel return a Promise", async () => {
            let res: () => void = () => void 0;
            const vm = { activate: jest.fn(() => new Promise(resolve => res = resolve)) };

            const resolvedSpy = jest.fn();
            activator.activate(vm).then(resolvedSpy);

            expect(vm.activate).toBeCalledTimes(1);
            expect(resolvedSpy).toBeCalledTimes(0);

            res();

            await timeout();

            expect(resolvedSpy).toBeCalledTimes(1);
        });

        test("should pass given arguments to activate function on the ViewModel", async () => {
            const args = [1, 2, 3];
            const vm = { activate: jest.fn() };
            await activator.activate(vm, args);

            expect(vm.activate).toBeCalledTimes(1);
            expect(vm.activate).toBeCalledWith(...args);
        });

        test("should work if no activate function is available on the ViewModel", async () => {
            const vm = {};
            await activator.activate(vm);
        });

        test("should set activated to true on the ViewModel", async () => {
            const vm = {};
            await activator.activate(vm);

            expect(vm).toHaveProperty("activated", true);
        });

        test("should not reactivate ViewModel if already activated", async () => {
            const vm = { activate: jest.fn() };
            await activator.activate(vm);
            await activator.activate(vm);

            expect(vm.activate).toBeCalledTimes(1);
        });

        test("should rejects if activate throws an Error", async () => {
            const vm = { activate: jest.fn(() => { throw new Error("ERROR"); }) };

            await expect(() => activator.activate(vm))
                .rejects.toThrowError("ERROR");
        });

        test("should rejects if activate rejects an Error", async () => {
            const vm = { activate: jest.fn(() => Promise.reject(new Error("ERROR"))) };

            await expect(() => activator.activate(vm))
                .rejects.toThrowError("ERROR");
        });

    });

    describe(".deactivate()", () => {

        test("should call deactivate function on the ViewModel if available", async () => {
            const vm = { activated: true, deactivate: jest.fn() };
            await activator.deactivate(vm);

            expect(vm.deactivate).toBeCalledTimes(1);
        });

        test("should wait for resolution if deactivate function on the ViewModel return a Promise", async () => {
            let res: () => void = () => void 0;
            const vm = { activated: true, deactivate: jest.fn(() => new Promise(resolve => res = resolve)) };

            const resolvedSpy = jest.fn();
            activator.deactivate(vm).then(resolvedSpy);

            expect(vm.deactivate).toBeCalledTimes(1);
            expect(resolvedSpy).toBeCalledTimes(0);

            res();

            await timeout();

            expect(resolvedSpy).toBeCalledTimes(1);
        });

        test("should pass false to deactivate function on the ViewModel if newVM === oldVM", async () => {
            const vm = { activated: true, deactivate: jest.fn() };
            await activator.deactivate(vm, vm);

            expect(vm.deactivate).toBeCalledTimes(1);
            expect(vm.deactivate).toBeCalledWith(false);
        });

        test("should pass true to deactivate function on the ViewModel if newVM !== oldVM", async () => {
            const vm = { activated: true, deactivate: jest.fn() };
            await activator.deactivate(vm, {});

            expect(vm.deactivate).toBeCalledTimes(1);
            expect(vm.deactivate).toBeCalledWith(true);
        });

        test("should work if no activate function is available on the ViewModel", async () => {
            const vm = { activated: true };
            await activator.deactivate(vm);
        });

        test("should set activated to false on the ViewModel", async () => {
            const vm = { activated: true };
            await activator.deactivate(vm);

            expect(vm).toHaveProperty("activated", false);
        });

        test("should not deactivate ViewModel if already deactivated", async () => {
            const vm = { activated: false, activate: jest.fn() };
            await activator.deactivate(vm);

            expect(vm.activate).not.toBeCalled();
        });

        test("should rejects if deactivate throws an Error", async () => {
            const vm = { activated: true, deactivate: jest.fn(() => { throw new Error("ERROR"); }) };

            await expect(() => activator.deactivate(vm))
                .rejects.toThrowError("ERROR");
        });

        test("should rejects if deactivate rejects an Error", async () => {
            const vm = { activated: true, deactivate: jest.fn(() => Promise.reject(new Error("ERROR"))) };

            await expect(() => activator.deactivate(vm))
                .rejects.toThrowError("ERROR");
        });

    });

    describe(".call()", () => {

        test("should call given function on the ViewModel if available", async () => {
            const vm = { activate: jest.fn() };
            await activator.call(vm, "activate");

            expect(vm.activate).toBeCalledTimes(1);
        });

        test("should wait for resolution if given function on the ViewModel return a Promise", async () => {
            let res: () => void = () => void 0;
            const vm = { activate: jest.fn(() => new Promise(resolve => res = resolve)) };

            const resolvedSpy = jest.fn();
            activator.call(vm, "activate").then(resolvedSpy);

            expect(vm.activate).toBeCalledTimes(1);
            expect(resolvedSpy).toBeCalledTimes(0);

            res();

            await timeout();

            expect(resolvedSpy).toBeCalledTimes(1);
        });

        test("should pass given arguments to given function on the ViewModel", async () => {
            const args = [1, 2, 3];
            const vm = { activate: jest.fn() };
            await activator.call(vm, "activate", ...args);

            expect(vm.activate).toBeCalledTimes(1);
            expect(vm.activate).toBeCalledWith(...args);
        });

        test("should resolve with null if given function is not available on the ViewModel", async () => {
            const vm: activator.ViewModel = {};
            await activator.call(vm, "activate");
        });

        test("should rejects if activate throws an Error", async () => {
            const vm = { activate: jest.fn(() => { throw new Error("ERROR"); }) };

            await expect(() => activator.call(vm, "activate"))
                .rejects.toThrowError("ERROR");
        });

        test("should rejects if activate rejects an Error", async () => {
            const vm = { activate: jest.fn(() => Promise.reject(new Error("ERROR"))) };

            await expect(() => activator.call(vm, "activate"))
                .rejects.toThrowError("ERROR");
        });

    });

});

function timeout(): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, 100);
    });
}
