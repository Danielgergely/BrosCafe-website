// Public catalog and editorial content. Port of backend/app/routers/content.py.
import { HttpError, type Router } from '../http';

export function register(api: Router) {
  api.get('/whats-new', (c) =>
    c.db.content.find({ active: { $ne: false } }, { sort: [['date', -1], ['order', 1]], limit: 200 }));

  api.get('/products', (c) => c.db.products.find({ active: { $ne: false } }, { sort: { order: 1 }, limit: 200 }));

  api.get('/products/{product_id}', async (c) => {
    const doc = await c.db.products.findOne({ id: c.params.product_id });
    if (!doc) throw new HttpError(404, 'Product not found');
    return doc;
  });
}
