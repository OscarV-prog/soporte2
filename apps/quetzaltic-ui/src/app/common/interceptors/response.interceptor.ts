import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { map } from 'rxjs/operators';

export const responseInterceptor: HttpInterceptorFn = (req, next) => {
    return next(req).pipe(
        map(event => {
            if (event instanceof HttpResponse) {
                const body = event.body;
                // If the body follows our GlobalResponse structure { success, data, meta }
                // and the request is to our API, we unwrap the data property.
                if (body && typeof body === 'object' && 'success' in body && 'data' in body) {
                    console.log(`[ResponseInterceptor] Unwrapping data for: ${req.url}`);
                    return event.clone({ body: body.data });
                }
            }
            return event;
        })
    );
};
