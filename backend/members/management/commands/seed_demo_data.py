from decimal import Decimal
from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.contrib.auth import get_user_model
from django_tenants.utils import schema_context, get_tenant_model

from members.models import (
    GivingPurpose, Contribution, CashContribution,
    SupportSubmission, MemberProfile
)

User = get_user_model()


class Command(BaseCommand):
    help = "Populate the database with realistic demo members, digital givings, cash receipts, and support submissions."

    def handle(self, *args, **options):
        TenantModel = get_tenant_model()
        tenants = list(TenantModel.objects.exclude(schema_name='public'))

        if not tenants:
            demo_tenant, created = TenantModel.objects.get_or_create(
                schema_name='loma_linda',
                defaults={'name': 'Loma Linda SDA Church', 'is_active': True}
            )
            if created:
                from tenants.models import Domain
                Domain.objects.get_or_create(
                    domain='demo.localhost',
                    tenant=demo_tenant,
                    defaults={'is_primary': True}
                )
            tenants = [demo_tenant]

        for tenant in tenants:
            try:
                with schema_context(tenant.schema_name):
                    self.stdout.write(self.style.SUCCESS(f"--- Seeding schema: {tenant.schema_name} ({tenant.name}) ---"))
                    self.seed_schema()
            except Exception as e:
                self.stdout.write(self.style.WARNING(f"Could not seed schema '{tenant.schema_name}': {e}"))

    def seed_schema(self):
        today = timezone.localdate()
        now = timezone.now()

        # 1. Create Default Giving Purposes
        default_purposes = [
            'Tithe',
            'Combined Offering',
            '13th Sabbath',
            'Camp Expenses',
            'Camp Goal',
            'Local Church Budget',
        ]
        for name in default_purposes:
            GivingPurpose.objects.get_or_create(name=name, defaults={'active': True})
        # Deactivate every other purpose so only the defaults remain active
        GivingPurpose.objects.exclude(name__in=default_purposes).update(active=False)
        self.stdout.write(self.style.SUCCESS(f"Verified {len(default_purposes)} default giving purposes."))

        # 2. Create Demo Members
        demo_users_data = [
            {"username": "samuel.otieno", "email": "samuel.otieno@example.com", "first_name": "Samuel", "last_name": "Otieno", "phone": "0712345678", "role": "leader"},
            {"username": "mary.wambui", "email": "mary.wambui@example.com", "first_name": "Mary", "last_name": "Wambui", "phone": "0722001122", "role": "member"},
            {"username": "david.kiprop", "email": "david.kiprop@example.com", "first_name": "David", "last_name": "Kiprop", "phone": "0733445566", "role": "treasurer"},
            {"username": "grace.akinyi", "email": "grace.akinyi@example.com", "first_name": "Grace", "last_name": "Akinyi", "phone": "0799887766", "role": "finance"},
            {"username": "joseph.mutua", "email": "joseph.mutua@example.com", "first_name": "Joseph", "last_name": "Mutua", "phone": "0701234567", "role": "member"},
            {"username": "faith.cherono", "email": "faith.cherono@example.com", "first_name": "Faith", "last_name": "Cherono", "phone": "0711223344", "role": "member"},
            {"username": "daniel.nyaga", "email": "daniel.nyaga@example.com", "first_name": "Daniel", "last_name": "Nyaga", "phone": "0723456789", "role": "member"},
            {"username": "mercy.mwangi", "email": "mercy.mwangi@example.com", "first_name": "Mercy", "last_name": "Mwangi", "phone": "0734567890", "role": "member"},
        ]

        created_users = []
        treasurer_user = None

        for udata in demo_users_data:
            user, created = User.objects.get_or_create(
                username=udata["username"],
                defaults={
                    "email": udata["email"],
                    "first_name": udata["first_name"],
                    "last_name": udata["last_name"],
                    "is_staff": udata["role"] in ["leader", "treasurer", "finance"],
                }
            )
            if created:
                user.set_password("demo1234")
                user.save()
            
            profile, _ = MemberProfile.objects.get_or_create(
                user=user,
                defaults={"phone_number": udata["phone"], "role": udata["role"]}
            )
            if profile.role != udata["role"] or profile.phone_number != udata["phone"]:
                profile.role = udata["role"]
                profile.phone_number = udata["phone"]
                profile.save(update_fields=["role", "phone_number"])
            
            created_users.append((user, udata))
            if udata["role"] in ["treasurer", "finance"] and not treasurer_user:
                treasurer_user = user

        if not treasurer_user and created_users:
            treasurer_user = created_users[0][0]

        self.stdout.write(self.style.SUCCESS(f"Created/verified {len(created_users)} demo members."))

        # 3. Create Demo Digital Givings (methods: cash, mpesa, bank_transfer, cheque)
        digital_samples = [
            {"name": "Samuel Otieno", "phone": "0712345678", "email": "samuel.otieno@example.com", "purpose": "Tithe", "amount": Decimal("25000.00"), "method": "mpesa", "ref": "QFX9210A", "days_ago": 0},
            {"name": "Samuel Otieno", "phone": "0712345678", "email": "samuel.otieno@example.com", "purpose": "Camp Goal", "amount": Decimal("15000.00"), "method": "mpesa", "ref": "QFX9211B", "days_ago": 0},
            {"name": "Mary Wambui", "phone": "0722001122", "email": "mary.wambui@example.com", "purpose": "Tithe", "amount": Decimal("12500.00"), "method": "mpesa", "ref": "QFY4192B", "days_ago": 0},
            {"name": "Mary Wambui", "phone": "0722001122", "email": "mary.wambui@example.com", "purpose": "Combined Offering", "amount": Decimal("3500.00"), "method": "bank_transfer", "ref": "B2B-8829A", "days_ago": 0},
            {"name": "David Kiprop", "phone": "0733445566", "email": "david.kiprop@example.com", "purpose": "13th Sabbath", "amount": Decimal("5000.00"), "method": "mpesa", "ref": "QFZ3104C", "days_ago": 0},
            {"name": "Joseph Mutua", "phone": "0701234567", "email": "joseph.mutua@example.com", "purpose": "Camp Expenses", "amount": Decimal("4500.00"), "method": "bank_transfer", "ref": "B2B-1092D", "days_ago": 0},
            {"name": "Faith Cherono", "phone": "0711223344", "email": "faith.cherono@example.com", "purpose": "Camp Goal", "amount": Decimal("3000.00"), "method": "mpesa", "ref": "QGA1044E", "days_ago": 0},
            {"name": "Daniel Nyaga", "phone": "0723456789", "email": "daniel.nyaga@example.com", "purpose": "Local Church Budget", "amount": Decimal("6000.00"), "method": "cheque", "ref": "CHQ-9102F", "days_ago": 0},
            {"name": "Mercy Mwangi", "phone": "0734567890", "email": "mercy.mwangi@example.com", "purpose": "Tithe", "amount": Decimal("2500.00"), "method": "mpesa", "ref": "QGB5519G", "days_ago": 0},
            {"name": "Grace Akinyi", "phone": "0799887766", "email": "grace.akinyi@example.com", "purpose": "Combined Offering", "amount": Decimal("8000.00"), "method": "mpesa", "ref": "QGC7730H", "days_ago": 0},
            {"name": "Samuel Otieno", "phone": "0712345678", "email": "samuel.otieno@example.com", "purpose": "Local Church Budget", "amount": Decimal("10000.00"), "method": "cheque", "ref": "CHQ-9921K", "days_ago": 0},
            {"name": "Faith Cherono", "phone": "0711223344", "email": "faith.cherono@example.com", "purpose": "Camp Expenses", "amount": Decimal("2000.00"), "method": "bank_transfer", "ref": "B2B-4402M", "days_ago": 0},
        ]

        from members.views import ensure_giver_profile

        digital_count = 0
        for ds in digital_samples:
            paid_dt = now - timedelta(days=ds["days_ago"])
            giver_user = ensure_giver_profile(ds["name"], ds["phone"], ds["email"])
            contrib, created = Contribution.objects.get_or_create(
                mpesa_receipt_number=ds["ref"],
                defaults={
                    "member": giver_user,
                    "donor_name": ds["name"],
                    "phone_number": ds["phone"],
                    "donor_email": ds["email"],
                    "purpose": ds["purpose"],
                    "amount": ds["amount"],
                    "payment_method": ds["method"],
                    "giving_type": "financial",
                    "status": "completed",
                    "paid_at": paid_dt,
                    "receipt_sent_at": paid_dt + timedelta(minutes=2),
                }
            )  # financial only — in-kind giving removed
            if not created:
                contrib.paid_at = paid_dt
                contrib.member = giver_user
                contrib.status = "completed"
                contrib.payment_method = ds["method"]
                contrib.save(update_fields=['paid_at', 'member', 'status', 'payment_method'])
            digital_count += 1

        # 4. Remove legacy in-kind demo contributions (in-kind giving has been retired)
        removed_inkind, _ = Contribution.objects.filter(giving_type='in_kind').delete()
        self.stdout.write(self.style.SUCCESS(f"Removed {removed_inkind} legacy in-kind contributions."))

        self.stdout.write(self.style.SUCCESS(f"Seeded {digital_count} digital contributions."))

        # 5. Create Demo Cash & Treasury Receipts (Cash, Cheque, Paybill, Bank Deposit)
        cash_samples = [
            {"name": "Samuel Otieno", "phone": "0712345678", "email": "samuel.otieno@example.com", "purpose": "Tithe", "amount": Decimal("18000.00"), "receipt": "REC-101", "entry_type": "individual", "payment_method": "cash", "days_ago": 0},
            {"name": "Mary Wambui", "phone": "0722001122", "email": "mary.wambui@example.com", "purpose": "Combined Offering", "amount": Decimal("4000.00"), "receipt": "REC-102", "entry_type": "individual", "payment_method": "cash", "days_ago": 0},
            {"name": "David Kiprop", "phone": "0733445566", "email": "david.kiprop@example.com", "purpose": "Development", "amount": Decimal("10000.00"), "receipt": "ENV-201", "entry_type": "individual", "payment_method": "cash", "days_ago": 0},
            {"name": "Grace Akinyi", "phone": "0799887766", "email": "grace.akinyi@example.com", "purpose": "Msamaria Mwema", "amount": Decimal("5000.00"), "receipt": "REC-103", "entry_type": "individual", "payment_method": "cash", "days_ago": 0},
            {"name": "Faith Cherono", "phone": "0711223344", "email": "faith.cherono@example.com", "purpose": "Camp Goal", "amount": Decimal("7500.00"), "receipt": "REC-104", "entry_type": "individual", "payment_method": "cash", "days_ago": 0},
            {"name": "Daniel Nyaga", "phone": "0723456789", "email": "daniel.nyaga@example.com", "purpose": "Tithe", "amount": Decimal("14000.00"), "receipt": "ENV-202", "entry_type": "individual", "payment_method": "cash", "days_ago": 0},
            {"name": "Main Service Offertory Collection", "phone": "", "email": "", "purpose": "Combined Offering", "amount": Decimal("28500.00"), "receipt": "COL-301", "entry_type": "collection", "payment_method": "cash", "days_ago": 0},
            {"name": "Anonymous Giver", "phone": "", "email": "", "purpose": "13th Sabbath", "amount": Decimal("5000.00"), "receipt": "REC-105", "entry_type": "anonymous", "payment_method": "cash", "days_ago": 0},
            
            # Cheque Givings
            {"name": "KCB Foundation", "phone": "0700000111", "email": "csr@kcb.co.ke", "purpose": "Development", "amount": Decimal("50000.00"), "receipt": "CHQ-9012", "entry_type": "individual", "payment_method": "cheque", "days_ago": 0},
            {"name": "Dr. Joseph Mutua", "phone": "0701234567", "email": "joseph.mutua@example.com", "purpose": "Tithe", "amount": Decimal("35000.00"), "receipt": "CHQ-4410", "entry_type": "individual", "payment_method": "cheque", "days_ago": 0},
            
            # Direct M-Pesa Paybill Receipts (recorded by treasurer)
            {"name": "Mercy Mwangi", "phone": "0734567890", "email": "mercy.mwangi@example.com", "purpose": "Tithe", "amount": Decimal("16000.00"), "receipt": "PBL-3091", "entry_type": "individual", "payment_method": "mpesa", "days_ago": 0},
            {"name": "Daniel Nyaga", "phone": "0723456789", "email": "daniel.nyaga@example.com", "purpose": "Combined Offering", "amount": Decimal("4500.00"), "receipt": "PBL-3092", "entry_type": "individual", "payment_method": "mpesa", "days_ago": 0},
            {"name": "Grace Akinyi", "phone": "0799887766", "email": "grace.akinyi@example.com", "purpose": "Camp Expenses", "amount": Decimal("6000.00"), "receipt": "PBL-3093", "entry_type": "individual", "payment_method": "mpesa", "days_ago": 0},

            # Direct Bank-to-Bank Transfers (recorded by treasurer)
            {"name": "Elder Samuel Otieno", "phone": "0712345678", "email": "samuel.otieno@example.com", "purpose": "Tithe", "amount": Decimal("75000.00"), "receipt": "DEP-4001", "entry_type": "individual", "payment_method": "bank_transfer", "days_ago": 0},
            {"name": "Mary Wambui", "phone": "0722001122", "email": "mary.wambui@example.com", "purpose": "Local Church Budget", "amount": Decimal("45000.00"), "receipt": "DEP-4002", "entry_type": "individual", "payment_method": "bank_transfer", "days_ago": 0},
            {"name": "David Kiprop", "phone": "0733445566", "email": "david.kiprop@example.com", "purpose": "Local Church Budget", "amount": Decimal("20000.00"), "receipt": "DEP-4003", "entry_type": "individual", "payment_method": "bank_transfer", "days_ago": 0},
        ]

        cash_count = 0
        for cs in cash_samples:
            rec_date = today - timedelta(days=cs["days_ago"])
            rec_dt = now - timedelta(days=cs["days_ago"])
            if cs["entry_type"] == "individual":
                ensure_giver_profile(cs["name"], cs["phone"], cs["email"])
            receipt_obj, created = CashContribution.objects.get_or_create(
                receipt_number=cs["receipt"],
                defaults={
                    "received_on": rec_date,
                    "amount": cs["amount"],
                    "purpose": cs["purpose"],
                    "entry_type": cs["entry_type"],
                    "payment_method": cs["payment_method"],
                    "donor_name": cs["name"],
                    "giver_phone": cs["phone"],
                    "giver_email": cs["email"],
                    "received_by": treasurer_user,
                    "receipt_sent_at": rec_dt,
                }
            )
            if not created:
                receipt_obj.received_on = rec_date
                receipt_obj.entry_type = cs["entry_type"]
                receipt_obj.payment_method = cs["payment_method"]
                receipt_obj.donor_name = cs["name"]
                receipt_obj.giver_phone = cs["phone"]
                receipt_obj.giver_email = cs["email"]
                receipt_obj.save(update_fields=['received_on', 'entry_type', 'payment_method', 'donor_name', 'giver_phone', 'giver_email'])
            cash_count += 1

        self.stdout.write(self.style.SUCCESS(f"Seeded {cash_count} treasury receipt entries across cash, cheque, M-Pesa, and bank transfers."))

        # 6. Create Demo Support Submissions (Ideas & Prayer Commitments)
        ideas_data = [
            {
                "type": "idea",
                "category": "Church Infrastructure & Technology",
                "content": "Proposal to install solar panels and battery storage to ensure uninterrupted power during Sabbath divine service and livestreaming.",
                "name": "Elder Samuel Otieno",
                "phone": "0712345678",
            },
            {
                "type": "idea",
                "category": "Community Outreach & Welfare",
                "content": "Organize a quarterly community health screening and medical camp at the church grounds to serve surrounding neighbors.",
                "name": "Sister Mary Wambui",
                "phone": "0722001122",
            },
            {
                "type": "idea",
                "category": "Youth & Children Programs",
                "content": "Establish a Sabbath afternoon youth coding and digital literacy mentorship club.",
                "name": "Brother Joseph Mutua",
                "phone": "0701234567",
            }
        ]

        prayers_data = [
            {
                "type": "prayer",
                "category": "Intercessory Prayer for Pastoral Team & Leaders",
                "content": "Pledging daily morning intercessory prayer for our pastor, elders, and Sabbath school teachers for wisdom and spiritual revival.",
                "name": "Sister Grace Akinyi",
                "phone": "0799887766",
                "email": "grace.akinyi@example.com",
            },
            {
                "type": "prayer",
                "category": "Sick, Bereaved & Vulnerable Members",
                "content": "Committing to visit and pray with sick church members every Sunday afternoon.",
                "name": "Sister Faith Cherono",
                "phone": "0711223344",
                "email": "faith.cherono@example.com",
            }
        ]

        sub_count = 0
        for item in (ideas_data + prayers_data):
            submission, created = SupportSubmission.objects.get_or_create(
                content=item["content"],
                defaults={
                    "submission_type": item["type"],
                    "category": item["category"],
                    "name": item["name"],
                }
            )
            if created:
                sub_count += 1

        self.stdout.write(self.style.SUCCESS(f"Seeded {sub_count} ideas & prayer support submissions."))

        # 7. Create Demo Treasury Accounts & Expenditures
        from members.models import TreasuryAccount, Expenditure
        acc_kcb, _ = TreasuryAccount.objects.get_or_create(
            name="KCB Main Account",
            defaults={
                "account_number": "1122334455",
                "account_type": "bank",
                "balance": Decimal("350000.00"),
                "description": "Primary church operating bank account"
            }
        )
        acc_paybill, _ = TreasuryAccount.objects.get_or_create(
            name="M-Pesa Paybill 522522",
            defaults={
                "account_number": "522522",
                "account_type": "mobile_money",
                "balance": Decimal("85000.00"),
                "description": "Mobile money collections account"
            }
        )
        acc_petty, _ = TreasuryAccount.objects.get_or_create(
            name="Treasury Petty Cash",
            defaults={
                "account_number": "PC-01",
                "account_type": "cash",
                "balance": Decimal("15000.00"),
                "description": "Physical cash float for minor church expenses"
            }
        )

        demo_expenditures = [
            {"title": "Sabbath School Quarterlies & Bibles", "amount": Decimal("12500.00"), "category": "sabbath_school", "account": acc_kcb, "payment_method": "bank_transfer", "vendor": "Adventist Book Center"},
            {"title": "Church Sanctuary Power & Water Bill", "amount": Decimal("18400.00"), "category": "utilities", "account": acc_paybill, "payment_method": "mpesa", "vendor": "Kenya Power / Meru Water"},
            {"title": "PA Sound System & Microphone Maintenance", "amount": Decimal("9500.00"), "category": "maintenance", "account": acc_petty, "payment_method": "cash", "vendor": "SoundMaster Tech"},
            {"title": "Evangelistic Campaign Tent Rental", "amount": Decimal("25000.00"), "category": "evangelism", "account": acc_kcb, "payment_method": "cheque", "vendor": "Prime Events Tents"},
        ]
        for exp_data in demo_expenditures:
            Expenditure.objects.get_or_create(
                title=exp_data["title"],
                defaults={
                    "amount": exp_data["amount"],
                    "category": exp_data["category"],
                    "account": exp_data["account"],
                    "payment_method": exp_data["payment_method"],
                    "vendor_payee": exp_data["vendor"],
                    "expenditure_date": today - timedelta(days=5),
                }
            )
        self.stdout.write(self.style.SUCCESS("Seeded demo Treasury Accounts and Expenditures."))
