/** Node modules the browser build never calls (EBOOT decryption, CSO, the CLI): fail loudly if it does. */
function unavailable(): never {
  throw new Error("Not available in the browser");
}
export const execFile = unavailable;
export const spawn = unavailable;
export const mkdtemp = unavailable;
export const readFile = unavailable;
export const writeFile = unavailable;
export const rm = unavailable;
export const tmpdir = unavailable;
export const promisify = () => unavailable;
export const inflateRawSync = unavailable;
export default {};
