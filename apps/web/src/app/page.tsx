import { redirect } from 'next/navigation';

/**
 * A raiz ainda não tem conteúdo próprio — só a administração existe até o M4.
 * Cliente (`/(customer)`) e KDS (`/(kds)`) são reservados desde o M4 (ADR-014) mas
 * ganham conteúdo real na Fase B.
 */
export default function RootPage(): never {
  redirect('/admin/login');
}
