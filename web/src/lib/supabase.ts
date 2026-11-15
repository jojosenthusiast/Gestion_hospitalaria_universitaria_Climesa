import {createClient} from '@supabase/supabase-js';
// Side effect first: snapshot the e-mail link parameters before supabase-js consumes the hash.
import './auth-redirect';
const url=import.meta.env.VITE_SUPABASE_URL as string|undefined;
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string|undefined;
function configuredClient(){
 if(!url||!key)return null;
 try{return createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});}catch{return null;}
}
export const supabase=configuredClient();
