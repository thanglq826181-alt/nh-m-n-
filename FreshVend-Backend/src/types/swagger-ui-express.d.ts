declare module 'swagger-ui-express' {
  import { RequestHandler } from 'express';

  const swaggerUi: {
    serve: RequestHandler[];
    setup(document: unknown, options?: unknown): RequestHandler;
  };

  export default swaggerUi;
}
