import { redirect } from 'next/navigation';
import { isLoggedIn } from '@/lib/auth';
import Importer from './importer';

export const dynamic = 'force-dynamic';

export default async function Home() {
  if (!(await isLoggedIn())) redirect('/login');
  return <Importer />;
}
