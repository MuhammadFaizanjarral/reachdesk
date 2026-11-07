import { getChatGPTUser } from './chatgpt-auth';
import WorkspaceApp from './workspace-app';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const user = await getChatGPTUser();
  return <WorkspaceApp user={user ? {name:user.displayName,email:user.email} : null} />;
}
