import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE_NAME, verifyToken } from '@/lib/auth';
import ContractorMenu from '@/components/ContractorMenu';

// /contractor เป็นหน้าเมนู ฟอร์มลงทะเบียนแรงงานย้ายไป /contractor/workers
// bookmark เดิมของผู้ใช้จะมาลงที่หน้าเมนู ซึ่งเข้าถึงฟอร์มเดิมได้ในหนึ่งแตะ
export default async function ContractorPage() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token) : null;
  if (!session) redirect('/login');

  return <ContractorMenu credential={session.credential} role={session.role} />;
}
