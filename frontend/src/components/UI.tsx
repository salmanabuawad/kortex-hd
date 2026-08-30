import React from 'react';
export function PageHeader({title,sub,actions}:{title:string,sub?:string,actions?:React.ReactNode}){return <div className="page-header"><div><h1>{title}</h1>{sub&&<p>{sub}</p>}</div><div className="header-actions">{actions}</div></div>}
export function Stat({label,value,trend,tone='blue'}:{label:string,value:string|number,trend?:string,tone?:string}){return <div className={`stat ${tone}`}><span>{label}</span><strong>{value}</strong>{trend&&<small>{trend}</small>}</div>}
export function Badge({children,tone='gray'}:{children:React.ReactNode,tone?:string}){return <span className={`badge ${tone}`}>{children}</span>}
export function Empty({children}:{children:React.ReactNode}){return <div className="empty">{children}</div>}
