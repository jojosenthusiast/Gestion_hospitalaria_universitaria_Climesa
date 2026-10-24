import { useEffect,useState } from 'react';
import type { AccessProfile,Api } from './api';
import { supabase } from './supabase';
export function useLive(api:Api,profile:AccessProfile,token:string,refreshProfile:()=>void){
 const [version,setVersion]=useState(0),[status,setStatus]=useState<'live'|'polling'|'offline'|'reconnecting'>('reconnecting');
 useEffect(()=>{
  let closed=false,pollBusy=false,cursor='0';const subscriptions:ReturnType<NonNullable<typeof supabase>['channel']>[]=[],joined=new Set<string>();
  const invalidate=()=>{if(!closed)setVersion(v=>v+1);};
  async function poll(){if(closed||pollBusy)return;pollBusy=true;try{const result=await api.request<{cursor:string;events:{entity:string}[]}>(`/eventos?after=${encodeURIComponent(cursor)}`);if(closed)return;cursor=String(result.cursor);if(result.events.length){invalidate();if(result.events.some(e=>e.entity==='usuario'))refreshProfile();}setStatus(joined.size===profile.channels.length&&joined.size>0?'live':'polling');}catch{if(!closed)setStatus(navigator.onLine?'reconnecting':'offline');}finally{pollBusy=false;}}
  const offline=()=>setStatus('offline'),online=()=>{invalidate();refreshProfile();void poll();};
  window.addEventListener('offline',offline);window.addEventListener('online',online);
  const timer=window.setInterval(()=>void poll(),5000);void poll();
  if(supabase)void supabase.realtime.setAuth(token).then(()=>{
   if(closed||!supabase)return;
   for(const channelName of profile.channels){const channel=supabase.channel(channelName,{config:{private:channelName!=='publico'}}).on('broadcast',{event:'*'},message=>{invalidate();if(message.payload?.entidad==='usuario')refreshProfile();}).subscribe(state=>{if(closed)return;if(state==='SUBSCRIBED'){joined.add(channelName);invalidate();setStatus(joined.size===profile.channels.length?'live':'polling');}else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(state)){joined.delete(channelName);setStatus(navigator.onLine?'polling':'offline');}});subscriptions.push(channel);}
  }).catch(()=>{if(!closed)setStatus('polling');});
  return()=>{closed=true;clearInterval(timer);window.removeEventListener('offline',offline);window.removeEventListener('online',online);for(const channel of subscriptions)void supabase?.removeChannel(channel);};
 },[api,profile.channels.join('|'),token,refreshProfile]);
 return {version,status};
}
