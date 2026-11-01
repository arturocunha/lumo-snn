// Fronteira de introspecção nativa: bibliotecas do sistema não têm typings locais.
declare module 'gi://*' { const api: any; export default api; }
declare module 'cairo' { const api: any; export default api; }
declare function print(value: string): void;
declare function printerr(value: string): void;
declare const ARGV: string[];
