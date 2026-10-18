/** 引擎同时运行于浏览器与 Node（≥17），两者都提供 structuredClone */
declare function structuredClone<T>(value: T): T;
