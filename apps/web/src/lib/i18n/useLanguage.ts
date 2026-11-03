import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { LANGUAGES, type Language, type Me } from '@sv/shared';
import { patch } from '../../api/client';
import { keys, useMe } from '../../api/hooks';
const key='sv-public-language';let local:Language='en';
try {const value=localStorage.getItem(key);if(LANGUAGES.includes(value as Language))local=value as Language;}catch{/* Storage is optional. */}
const listeners=new Set<()=>void>();const subscribe=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
function setLocal(language:Language){local=language;try{localStorage.setItem(key,language);}catch{/* Works for the session. */}listeners.forEach(fn=>fn());}
export function useLanguage(){const localLanguage=useSyncExternalStore(subscribe,()=>local,()=> 'en' as Language);const me=useMe();const qc=useQueryClient();const mutation=useMutation({mutationFn:({language}:{language:Language;userId:string})=>patch<Me>('/auth/language',{language}),onSuccess:(result,vars)=>qc.setQueryData<Me|null>(keys.me,current=>current?.user.id===vars.userId?{...current,user:{...current.user,language:result.user.language}}:current)});const language:Language=me.data&&!me.data.demo?me.data.user.language??'en':localLanguage;function change(next:Language){if(me.data&&!me.data.demo)mutation.mutate({language:next,userId:me.data.user.id});else setLocal(next);}return{language,change,isPending:mutation.isPending,error:mutation.error};}
