import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

from members.models import Department, DepartmentMembership, DepartmentAssignment, MemberProfile, DepartmentRole
from django.contrib.auth.models import User

print("=== Departments ===")
for d in Department.objects.filter(is_active=True).order_by('code'):
    print(f"  {d.code}  {d.name}")

print("\n=== DepartmentMembership ===")
for m in DepartmentMembership.objects.select_related('member').all():
    u = m.member
    print(f"  {u.username}  ->  {m.department.code}")

print("\n=== DepartmentAssignment ===")
for a in DepartmentAssignment.objects.select_related('member', 'role', 'department').all():
    print(f"  {a.member.username}  {a.kind}  {a.role.name}  in {a.department.code}")

print("\n=== MemberProfile (with ties) ===")
for p in MemberProfile.objects.select_related('user', 'department_ref').all():
    u = p.user
    print(f"  {u.username}  profile: department_ref={p.department_ref.code if p.department_ref else None}, ministries={[m.code for m in p.ministries.all()]}, roles={[r for r in p.roles.all()]}")
