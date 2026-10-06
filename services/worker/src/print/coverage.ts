/**
 * Where the printer ships (@cp/domain `printShipsTo`, the same list the api sorts recipients by),
 * checked again here before an order is placed: an address saved after the mailing was made could
 * name a country the printer cannot reach.
 */
export { printShipsTo, PRINT_UNSUPPORTED_COUNTRIES } from '@cp/domain';
