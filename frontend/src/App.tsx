import { useState } from "react";
import Login from "./pages/Login";
import Shell from "./layouts/Shell";
import Dashboard from "./pages/Dashboard";
import Orders from "./pages/Orders";
import Inventory from "./pages/Inventory";
import Production from "./pages/Production";
import Reports from "./pages/Reports";

export default function App(){
  const [session,setSession]=useState<any>(()=>{const t=localStorage.getItem("snackflow_token");const role=localStorage.getItem("snackflow_role");const username=localStorage.getItem("snackflow_username");return t?{access_token:t,role,username}:null;});
  const [page,setPage]=useState("dashboard");
  function login(data:any){localStorage.setItem("snackflow_role",data.role);localStorage.setItem("snackflow_username",data.username);setSession(data);}
  function logout(){localStorage.removeItem("snackflow_token");localStorage.removeItem("snackflow_role");localStorage.removeItem("snackflow_username");setSession(null);}
  if(!session)return <Login onLogin={login}/>;
  const role=session.role||localStorage.getItem("snackflow_role");
  return <Shell page={page} setPage={setPage} role={role} username={session.username||localStorage.getItem("snackflow_username")} logout={logout}>
    {page==="dashboard"&&<Dashboard role={role}/>}
    {page==="orders"&&<Orders role={role}/>}
    {page==="inventory"&&<Inventory role={role}/>}
    {page==="production"&&<Production role={role}/>}
    {page==="reports"&&<Reports/>}
  </Shell>;
}
