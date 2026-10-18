import React, {useEffect, useState} from 'react';
import {teamCrest} from '../../services/team-crest';
import {useCareerStore} from '../../stores/careerStore';
import {publicAssetUrl} from '../utils/public-assets';

export function TeamCrest({id,name}:{id:string;name:string}) {
  const custom=useCareerStore(s=>s.team?.id===id?s.team.branding?.logo:null);
  const source=custom||teamCrest(id);
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[id,source]);
  const initials=name.split(/\s+/).filter(Boolean).map(part=>Array.from(part)[0]).slice(0,3).join('').toUpperCase();
  return <span className="matchday-team-crest">
    {source&&!failed?<img src={publicAssetUrl(source)}
      alt={`${name} crest`} onError={()=>setFailed(true)} />:<span aria-label={`${name} crest`}>{initials||'?'}</span>}
  </span>;
}
