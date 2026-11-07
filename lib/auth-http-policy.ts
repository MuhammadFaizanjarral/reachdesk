const postPaths=new Set(['/api/auth/sign-in/email','/api/auth/sign-out','/api/auth/change-password']);
const getPaths=new Set(['/api/auth/get-session']);
export function isAllowedAuthRequest(method:string,pathname:string){
 const path=pathname.replace(/\/$/,'');
 return method==='GET'?getPaths.has(path):method==='POST'&&postPaths.has(path);
}
