from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand, CommandError
from django_tenants.utils import get_tenant_model, schema_context

from members.models import MemberProfile
from members.password_policy import REQUIREMENTS_TEXT, password_problems
from members.views import ROLE_GROUP_MAP, generate_temporary_password


class Command(BaseCommand):
    help = (
        "Create (or update) a church account: the login user plus its member profile "
        "and role codes. Use --roles admin,clerk for leadership access; plain members "
        "only need --roles member."
    )

    def add_arguments(self, parser):
        parser.add_argument('--username', required=True, help='Login username')
        parser.add_argument('--email', default='', help='Email address')
        parser.add_argument('--first-name', default='', help='First name')
        parser.add_argument('--last-name', default='', help='Last name')
        parser.add_argument('--phone', default='', help='Phone number')
        parser.add_argument(
            '--password',
            default=None,
            help='Password to set. Omit to have one generated and printed once.',
        )
        parser.add_argument(
            '--roles',
            default='member',
            help='Comma-separated role codes, e.g. member, admin, clerk, elder, treasurer, finance',
        )
        parser.add_argument(
            '--account-type',
            default='member',
            choices=['member', 'friend'],
            help='Member account or Friend of the church',
        )
        parser.add_argument(
            '--schema',
            default=None,
            help='Church schema to attach the profile to (default: every church tenant)',
        )
        parser.add_argument('--staff', action='store_true', help='Grant Django admin access')
        parser.add_argument('--superuser', action='store_true', help='Grant full superuser access')
        parser.add_argument(
            '--update',
            action='store_true',
            help='Update the account if the username already exists instead of stopping',
        )

    def handle(self, *args, **options):
        User = get_user_model()
        username = (options['username'] or '').strip()
        if not username:
            raise CommandError('--username is required.')

        valid_roles = {code for code, _ in MemberProfile.ROLE_CHOICES}
        roles = [r.strip() for r in (options['roles'] or '').split(',') if r.strip()]
        if not roles:
            raise CommandError('--roles cannot be empty; use "member" for a plain member.')
        unknown = [r for r in roles if r not in valid_roles]
        if unknown:
            raise CommandError(
                f"Unknown role code(s): {', '.join(unknown)}. Valid codes: {', '.join(sorted(valid_roles))}"
            )

        if options['password']:
            problems = password_problems(options['password'])
            if problems:
                raise CommandError(' '.join(problems) + f' {REQUIREMENTS_TEXT}')

        user = User.objects.filter(username=username).first()
        generated_password = None

        if user is None:
            generated_password = options['password'] or generate_temporary_password()
            user = User.objects.create_user(
                username=username,
                email=options['email'],
                first_name=options['first_name'],
                last_name=options['last_name'],
                password=generated_password,
            )
            if options['superuser']:
                user.is_superuser = True
            if options['staff'] or options['superuser']:
                user.is_staff = True
            user.save()
            self.stdout.write(self.style.SUCCESS(f"Created login '{username}' (id {user.id})."))
        else:
            if not options['update']:
                raise CommandError(
                    f"User '{username}' already exists — pass --update to change roles or details."
                )
            changed = []
            if options['email'] and user.email != options['email']:
                user.email = options['email']
                changed.append('email')
            if options['first_name']:
                user.first_name = options['first_name']
                changed.append('first_name')
            if options['last_name']:
                user.last_name = options['last_name']
                changed.append('last_name')
            if options['password']:
                user.set_password(options['password'])
                changed.append('password')
            if options['superuser'] and not user.is_superuser:
                user.is_superuser = True
                changed.append('is_superuser')
            if (options['staff'] or options['superuser']) and not user.is_staff:
                user.is_staff = True
                changed.append('is_staff')
            if changed:
                user.save()
            self.stdout.write(self.style.SUCCESS(f"Updated login '{username}' ({', '.join(changed) or 'no login changes'})."))

        TenantModel = get_tenant_model()
        tenants = TenantModel.objects.exclude(schema_name='public')
        if options['schema']:
            tenants = tenants.filter(schema_name=options['schema'])
        tenants = list(tenants)
        if not tenants:
            raise CommandError('No church tenant schema found to attach a member profile to.')

        for tenant in tenants:
            with schema_context(tenant.schema_name):
                profile, created = MemberProfile.objects.get_or_create(user=user)
                profile.role = roles[0]
                profile.roles = ', '.join(roles)
                profile.account_type = options['account_type']
                if options['phone']:
                    profile.phone_number = options['phone']
                profile.save()
                self.stdout.write(
                    self.style.SUCCESS(
                        f"{'Created' if created else 'Updated'} member profile in '{tenant.schema_name}' "
                        f"({tenant.name}) with roles: {profile.roles}"
                    )
                )

        # Role groups live in the shared public schema.
        groups = sorted({ROLE_GROUP_MAP[r] for r in roles if r in ROLE_GROUP_MAP})
        if groups:
            with schema_context('public'):
                for group_name in groups:
                    group = Group.objects.filter(name=group_name).first()
                    if group:
                        user.groups.add(group)
                        self.stdout.write(self.style.SUCCESS(f"Added '{username}' to group '{group_name}'."))
                    else:
                        self.stdout.write(
                            self.style.WARNING(f"Group '{group_name}' not found — run `manage.py seed_defaults` first.")
                        )

        if generated_password:
            self.stdout.write('')
            self.stdout.write(self.style.WARNING(f"Temporary password for '{username}': {generated_password}"))
            self.stdout.write('Share it with the account holder and ask them to change it after signing in.')
