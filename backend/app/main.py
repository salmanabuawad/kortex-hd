import os, secrets, shutil
from datetime import datetime
from pathlib import Path
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from .config import FRONTEND_URL, UPLOAD_DIR
from .db import get_db
from . import models, schemas
from .security import create_token, decode_token, hash_password, verify_password

app = FastAPI(title="MunicipOS Helpdesk API")
app.add_middleware(CORSMiddleware, allow_origins=[FRONTEND_URL], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
UPLOADS = Path(UPLOAD_DIR); UPLOADS.mkdir(parents=True, exist_ok=True)

# Schema creation and seeding are deploy steps, not import side effects:
#   python -m app.init_db && python -m app.seed
# Doing them here raced across uvicorn workers and re-seeded on every restart.

def current_user(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "authentication required")
    try:
        payload = decode_token(authorization.split(" ",1)[1]); uid = int(payload["sub"])
    except Exception:
        raise HTTPException(401, "invalid token")
    user = db.get(models.User, uid)
    if not user or not user.active: raise HTTPException(401, "inactive user")
    return user

def require_staff(user=Depends(current_user)):
    if user.role not in {"resolver","admin","approver"}: raise HTTPException(403, "staff only")
    return user

def audit(db, ticket_id, actor, action, details=None):
    db.add(models.AuditLog(ticket_id=ticket_id, actor=actor, action=action, details=details))

def ticket_json(t):
    return {"id":t.id,"number":t.number,"title":t.title,"description":t.description,"request_type":t.request_type,"priority":t.priority,"status":t.status,"category_id":t.category_id,"category":t.category.name if t.category else "","requester_id":t.requester_id,"requester":t.requester.name if t.requester else "","resolver_id":t.resolver_id,"resolver":t.resolver.name if t.resolver else None,"estimated_cost":t.estimated_cost,"estimated_hours":t.estimated_hours,"approval_status":t.approval_status,"created_at":t.created_at.isoformat(),"updated_at":t.updated_at.isoformat()}

def apply_approval_rules(db, ticket, category):
    reasons=[]
    if category.cost_threshold is not None and ticket.estimated_cost is not None and ticket.estimated_cost > category.cost_threshold: reasons.append(f"עלות מעל {category.cost_threshold}")
    if category.hours_threshold is not None and ticket.estimated_hours is not None and ticket.estimated_hours > category.hours_threshold: reasons.append(f"שעות עבודה מעל {category.hours_threshold}")
    if category.approval_new_service and ticket.request_type == "new_service": reasons.append("שירות חדש")
    if reasons:
        ticket.approval_status="pending"
        db.add(models.Approval(ticket_id=ticket.id, approver_id=category.escalation_id, reason="; ".join(reasons)))
    else: ticket.approval_status="not_required"

@app.get("/api/health")
def health(): return {"status":"ok","time":datetime.utcnow().isoformat()}

@app.post("/api/auth/login")
def login(data: schemas.LoginIn, db: Session=Depends(get_db)):
    user=db.query(models.User).filter(models.User.email==data.email.lower()).first()
    if not user or not verify_password(data.password,user.password_hash): raise HTTPException(401,"invalid credentials")
    return {"token":create_token(user.id,user.role),"user":{"id":user.id,"name":user.name,"email":user.email,"role":user.role,"force_password_change":user.force_password_change}}

@app.get("/api/me")
def me(user=Depends(current_user)): return {"id":user.id,"name":user.name,"email":user.email,"phone":user.phone,"role":user.role,"force_password_change":user.force_password_change}

@app.post("/api/me/password")
def change_own_password(data: schemas.PasswordChange, user=Depends(current_user), db: Session=Depends(get_db)):
    """Self-service password change. Required for accounts flagged force_password_change."""
    if not verify_password(data.current_password, user.password_hash): raise HTTPException(400,"current password is incorrect")
    if len(data.new_password) < 10: raise HTTPException(400,"password must be at least 10 characters")
    user.password_hash=hash_password(data.new_password); user.force_password_change=False; db.commit(); return {"ok":True}

@app.get("/api/categories")
def categories(user=Depends(current_user), db: Session=Depends(get_db)):
    rows=db.query(models.Category).filter(models.Category.active==True).all()
    return [{"id":c.id,"name":c.name,"description":c.description,"resolver_id":c.resolver_id,"escalation_id":c.escalation_id,"cost_threshold":c.cost_threshold,"hours_threshold":c.hours_threshold,"approval_new_service":c.approval_new_service} for c in rows]

@app.get("/api/users")
def users(user=Depends(require_staff), db: Session=Depends(get_db)):
    return [{"id":u.id,"name":u.name,"email":u.email,"phone":u.phone,"role":u.role,"active":u.active} for u in db.query(models.User).all()]

@app.get("/api/tickets")
def tickets(user=Depends(current_user), db: Session=Depends(get_db)):
    q=db.query(models.Ticket)
    if user.role=="user": q=q.filter(models.Ticket.requester_id==user.id)
    elif user.role=="resolver": q=q.filter((models.Ticket.resolver_id==user.id) | (models.Ticket.requester_id==user.id))
    return [ticket_json(t) for t in q.order_by(models.Ticket.id.desc()).all()]

@app.post("/api/tickets")
def create_ticket(data: schemas.TicketCreate, user=Depends(current_user), db: Session=Depends(get_db)):
    cat=db.get(models.Category,data.category_id)
    if not cat or not cat.active: raise HTTPException(400,"invalid category")
    t=models.Ticket(number="TMP",title=data.title,description=data.description,category_id=cat.id,requester_id=user.id,resolver_id=cat.resolver_id,request_type=data.request_type,priority=data.priority,estimated_cost=data.estimated_cost,estimated_hours=data.estimated_hours,status="assigned" if cat.resolver_id else "new")
    db.add(t); db.flush(); t.number=f"{datetime.utcnow().strftime('%y%m')}{t.id:05d}"
    apply_approval_rules(db,t,cat); audit(db,t.id,user.name,"ticket_created",f"category={cat.name}")
    db.commit(); db.refresh(t); return ticket_json(t)

@app.get("/api/tickets/{ticket_id}")
def get_ticket(ticket_id:int,user=Depends(current_user),db:Session=Depends(get_db)):
    t=db.get(models.Ticket,ticket_id)
    if not t: raise HTTPException(404,"not found")
    if user.role=="user" and t.requester_id!=user.id: raise HTTPException(403,"forbidden")
    if user.role=="resolver" and t.requester_id!=user.id and t.resolver_id!=user.id: raise HTTPException(403,"forbidden")
    if t.resolver_id==user.id and t.status=="assigned": t.status="viewed"; audit(db,t.id,user.name,"ticket_viewed"); db.commit()
    data=ticket_json(t)
    data["subtasks"]=[{"id":s.id,"title":s.title,"description":s.description,"status":s.status,"assignee_type":s.assignee_type,"external_name":s.external_name,"delivery_channel":s.delivery_channel,"guest_url":f"/external/{s.guest_token}" if s.guest_token and s.status not in {"resolved","closed"} else None} for s in db.query(models.Subtask).filter(models.Subtask.ticket_id==t.id).all()]
    data["comments"]=[{"id":c.id,"author":c.author_name,"body":c.body,"internal":c.internal,"created_at":c.created_at.isoformat()} for c in db.query(models.Comment).filter(models.Comment.ticket_id==t.id).order_by(models.Comment.id).all() if not(c.internal and user.role=="user")]
    data["audit"]=[{"id":a.id,"actor":a.actor,"action":a.action,"details":a.details,"created_at":a.created_at.isoformat()} for a in db.query(models.AuditLog).filter(models.AuditLog.ticket_id==t.id).order_by(models.AuditLog.id.desc()).limit(50)]
    return data

@app.patch("/api/tickets/{ticket_id}")
def update_ticket(ticket_id:int,data:schemas.TicketUpdate,user=Depends(require_staff),db:Session=Depends(get_db)):
    t=db.get(models.Ticket,ticket_id)
    if not t: raise HTTPException(404,"not found")
    if user.role=="resolver" and t.resolver_id!=user.id: raise HTTPException(403,"not assigned to you")
    old=t.status
    for field,val in data.model_dump(exclude_none=True).items(): setattr(t,field,val)
    if data.status in {"resolved","rejected"}: audit(db,t.id,user.name,f"ticket_{data.status}",f"from={old}")
    else: audit(db,t.id,user.name,"ticket_updated",str(data.model_dump(exclude_none=True)))
    db.commit(); db.refresh(t); return ticket_json(t)

@app.post("/api/tickets/{ticket_id}/reopen")
def reopen(ticket_id:int,user=Depends(current_user),db:Session=Depends(get_db)):
    t=db.get(models.Ticket,ticket_id)
    if not t or t.requester_id!=user.id: raise HTTPException(404,"not found")
    if t.status not in {"resolved","rejected"}: raise HTTPException(400,"ticket is not closed")
    t.status="reopened"; audit(db,t.id,user.name,"ticket_reopened"); db.commit(); return ticket_json(t)

@app.post("/api/tickets/{ticket_id}/reassign")
def reassign(ticket_id:int,data:schemas.ReassignIn,user=Depends(require_staff),db:Session=Depends(get_db)):
    t=db.get(models.Ticket,ticket_id)
    if not t: raise HTTPException(404,"not found")
    if user.role=="resolver" and t.resolver_id!=user.id: raise HTTPException(403,"not assigned to you")
    new=db.get(models.User,data.resolver_id)
    if not new or new.role not in {"resolver","admin"}: raise HTTPException(400,"invalid resolver")
    old=t.resolver.name if t.resolver else "none"; oldcat=t.category.name if t.category else "none"
    t.resolver_id=new.id
    if data.category_id:
        cat=db.get(models.Category,data.category_id)
        if not cat: raise HTTPException(400,"invalid category")
        t.category_id=cat.id
    t.status="assigned"
    audit(db,t.id,user.name,"ticket_reassigned",f"{old}/{oldcat} -> {new.name}/{t.category.name}; reason={data.reason}")
    db.commit(); return ticket_json(t)

@app.post("/api/tickets/{ticket_id}/comments")
def add_comment(ticket_id:int,data:schemas.CommentIn,user=Depends(current_user),db:Session=Depends(get_db)):
    t=db.get(models.Ticket,ticket_id)
    if not t: raise HTTPException(404,"not found")
    if user.role=="user" and t.requester_id!=user.id: raise HTTPException(403,"forbidden")
    db.add(models.Comment(ticket_id=t.id,author_user_id=user.id,author_name=user.name,body=data.body,internal=(data.internal and user.role!="user")))
    audit(db,t.id,user.name,"comment_added","internal" if data.internal else "public"); db.commit(); return {"ok":True}

@app.post("/api/tickets/{ticket_id}/subtasks")
def create_subtask(ticket_id:int,data:schemas.SubtaskCreate,user=Depends(require_staff),db:Session=Depends(get_db)):
    t=db.get(models.Ticket,ticket_id)
    if not t: raise HTTPException(404,"not found")
    if user.role=="resolver" and t.resolver_id!=user.id: raise HTTPException(403,"not assigned to you")
    token=secrets.token_urlsafe(32) if data.assignee_type=="external" else None
    if data.assignee_type=="external" and not (data.external_email or data.external_phone): raise HTTPException(400,"external contact required")
    s=models.Subtask(ticket_id=t.id,title=data.title,description=data.description,assignee_type=data.assignee_type,assignee_user_id=data.assignee_user_id,external_name=data.external_name,external_email=str(data.external_email) if data.external_email else None,external_phone=data.external_phone,delivery_channel=data.delivery_channel,guest_token=token)
    db.add(s); t.status="in_progress"; audit(db,t.id,user.name,"subtask_created",f"external={data.assignee_type=='external'} channel={data.delivery_channel}"); db.commit(); db.refresh(s)
    return {"id":s.id,"status":s.status,"guest_url":f"/external/{token}" if token else None,"delivery":"queued" if token else "internal"}

@app.get("/api/external/{token}")
def external_get(token:str,db:Session=Depends(get_db)):
    s=db.query(models.Subtask).filter(models.Subtask.guest_token==token).first()
    if not s or s.status in {"resolved","closed"}: raise HTTPException(410,"link is no longer valid")
    t=db.get(models.Ticket,s.ticket_id)
    comments=[{"author":c.author_name,"body":c.body,"created_at":c.created_at.isoformat()} for c in db.query(models.Comment).filter(models.Comment.subtask_id==s.id,models.Comment.internal==False).order_by(models.Comment.id)]
    return {"subtask":{"id":s.id,"title":s.title,"description":s.description,"status":s.status},"ticket":{"number":t.number,"title":t.title},"comments":comments}

@app.patch("/api/external/{token}")
def external_update(token:str,data:schemas.GuestUpdate,db:Session=Depends(get_db)):
    s=db.query(models.Subtask).filter(models.Subtask.guest_token==token).first()
    if not s or s.status in {"resolved","closed"}: raise HTTPException(410,"link is no longer valid")
    if data.comment: db.add(models.Comment(subtask_id=s.id,author_name=s.external_name or "External",body=data.comment,internal=False))
    if data.status:
        if data.status not in {"open","in_progress","resolved"}: raise HTTPException(400,"invalid status")
        s.status=data.status
        if data.status=="resolved": s.resolved_at=datetime.utcnow()
    audit(db,s.ticket_id,s.external_name or "External","external_subtask_updated",data.status or "comment")
    db.commit(); return {"ok":True,"status":s.status,"token_active":s.status not in {"resolved","closed"}}

@app.post("/api/external/{token}/attachments")
def external_upload(token:str,file:UploadFile=File(...),db:Session=Depends(get_db)):
    s=db.query(models.Subtask).filter(models.Subtask.guest_token==token).first()
    if not s or s.status in {"resolved","closed"}: raise HTTPException(410,"link is no longer valid")
    stored=f"{secrets.token_hex(10)}_{Path(file.filename or 'file').name}"; target=UPLOADS/stored
    with target.open("wb") as out: shutil.copyfileobj(file.file,out)
    db.add(models.Attachment(subtask_id=s.id,filename=file.filename or stored,stored_name=stored,uploaded_by=s.external_name or "External")); audit(db,s.ticket_id,s.external_name or "External","external_attachment_uploaded",file.filename); db.commit(); return {"ok":True}

@app.get("/api/approvals")
def approvals(user=Depends(require_staff),db:Session=Depends(get_db)):
    q=db.query(models.Approval).filter(models.Approval.status=="pending")
    if user.role=="approver": q=q.filter(models.Approval.approver_id==user.id)
    result=[]
    for a in q.all():
        t=db.get(models.Ticket,a.ticket_id); result.append({"id":a.id,"ticket_id":t.id,"ticket_number":t.number,"title":t.title,"reason":a.reason,"status":a.status,"created_at":a.created_at.isoformat()})
    return result

@app.post("/api/approvals/{approval_id}")
def decide(approval_id:int,data:schemas.ApprovalDecision,user=Depends(require_staff),db:Session=Depends(get_db)):
    a=db.get(models.Approval,approval_id)
    if not a or a.status!="pending": raise HTTPException(404,"not found")
    if user.role=="approver" and a.approver_id!=user.id: raise HTTPException(403,"forbidden")
    if data.decision not in {"approved","rejected"}: raise HTTPException(400,"invalid decision")
    a.status=data.decision; a.decision_note=data.note; a.decided_at=datetime.utcnow(); t=db.get(models.Ticket,a.ticket_id); t.approval_status=data.decision; audit(db,t.id,user.name,"approval_decision",data.decision); db.commit(); return {"ok":True}

@app.post("/api/categories")
def create_category(data: schemas.CategoryCreate, user=Depends(require_staff), db: Session=Depends(get_db)):
    if user.role != "admin": raise HTTPException(403, "admin only")
    if db.query(models.Category).filter(models.Category.name==data.name).first(): raise HTTPException(409, "category exists")
    c=models.Category(**data.model_dump()); db.add(c); db.commit(); db.refresh(c)
    return {"id":c.id,"name":c.name}

@app.patch("/api/categories/{category_id}")
def update_category(category_id:int, data: schemas.CategoryCreate, user=Depends(require_staff), db: Session=Depends(get_db)):
    if user.role != "admin": raise HTTPException(403, "admin only")
    c=db.get(models.Category,category_id)
    if not c: raise HTTPException(404,"not found")
    for k,v in data.model_dump().items(): setattr(c,k,v)
    db.commit(); return {"ok":True}

@app.delete("/api/categories/{category_id}")
def delete_category(category_id:int, user=Depends(require_staff), db: Session=Depends(get_db)):
    if user.role != "admin": raise HTTPException(403, "admin only")
    c=db.get(models.Category,category_id)
    if not c: raise HTTPException(404,"not found")
    if db.query(models.Ticket).filter(models.Ticket.category_id==category_id).count():
        c.active=False
    else:
        db.delete(c)
    db.commit(); return {"ok":True}

@app.post("/api/users")
def create_user(data: schemas.UserCreate, user=Depends(require_staff), db: Session=Depends(get_db)):
    if user.role != "admin": raise HTTPException(403, "admin only")
    if data.role not in {"user","resolver","approver","admin"}: raise HTTPException(400,"invalid role")
    if db.query(models.User).filter(models.User.email==str(data.email).lower()).first(): raise HTTPException(409,"user exists")
    u=models.User(name=data.name,email=str(data.email).lower(),phone=data.phone,role=data.role,password_hash=hash_password(data.password),force_password_change=True)
    db.add(u); db.commit(); db.refresh(u); return {"id":u.id,"name":u.name}

@app.post("/api/users/{user_id}/reset-password")
def reset_password(user_id:int, data: schemas.PasswordReset, user=Depends(require_staff), db: Session=Depends(get_db)):
    if user.role != "admin": raise HTTPException(403, "admin only")
    target=db.get(models.User,user_id)
    if not target: raise HTTPException(404,"not found")
    target.password_hash=hash_password(data.password); target.force_password_change=True; db.commit(); return {"ok":True}
