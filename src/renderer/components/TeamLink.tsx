import React from 'react';
import {Link} from 'react-router-dom';

export function TeamLink({id,children}:{id?:string|null;children:React.ReactNode}){
  return id&&!id.startsWith('__')?<Link className="text-link" to={`/team/${encodeURIComponent(id)}`} onClick={e=>e.stopPropagation()}>{children}</Link>:<span>{children}</span>;
}
