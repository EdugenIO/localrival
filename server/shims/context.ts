import {AsyncLocalStorage} from 'node:async_hooks';
export const requestContext=new AsyncLocalStorage<Request>();
export async function headers(){const request=requestContext.getStore();if(!request)throw Error('No request context');return request.headers}
