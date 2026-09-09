import { redirect } from 'next/navigation';

export default function CatalogIndexPage(): never {
  redirect('/admin/catalog/products');
}
