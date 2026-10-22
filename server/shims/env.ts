import type {PlayerDatabase} from '../../lib/database-types';
export const env:{[key:string]:unknown;DB?:PlayerDatabase}={...process.env};
