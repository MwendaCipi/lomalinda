"""Make the built-in legal wording the church's own, editable documents.

The two legal pages carried wording only the code could change; church
settings gained Privacy Policy and Terms of Use boxes that override it when
written. The church has chosen to adopt the built-in wording as its own
starting point, so this migration copies it into the boxes — the admin can
now edit it like any other piece of church copy, and the pages stop depending
on code for their document. Only rows where the church has written nothing
are seeded; a document the church already wrote is never overwritten.
"""

from django.db import migrations

PRIVACY_POLICY = """Who we are

This website is operated by SDA Loma Linda, Meru, Kenya. The church is responsible for the personal information submitted through its website, forms, member accounts and church services.

Information we collect

Depending on the service you use, we may collect your name, phone number, email address, account credentials, membership and transfer details, date and county of birth, visitation location, prayer or testimony details, ministry information, giving records and communications with the church.

How we use information

We use information to create and manage accounts, process membership and transfer requests, arrange visitation and pastoral care, respond to prayer and testimony requests, administer giving, communicate church activities, provide requested resources, protect our services and meet legal, accounting and safeguarding responsibilities.

Payments and service providers

When you give, payment providers such as M-Pesa or Paystack may process payment details under their own terms and privacy notices. We may use hosting, email, mapping, security and communication providers to operate the service. We do not sell personal information.

Access, retention and security

Church workers receive access only where it is needed for their responsibilities. We retain information for as long as reasonably needed for church administration, legal, accounting, safeguarding or dispute-resolution purposes. We use access controls and other reasonable safeguards, but no online service can guarantee absolute security.

Your choices and rights

You may ask what personal information we hold about you, request correction of inaccurate information, ask us to delete information where appropriate, withdraw optional communications, or raise a concern about how information is used. Contact us at hello@sdalomalinda.or.ke.

Children and safeguarding

Information about a child should be submitted by a parent or legal guardian, or with appropriate church safeguarding oversight. Do not use public forms to share information that is not necessary for the request.

Policy changes

We may update this policy when our services or data practices change. The current version and its effective date remain available on this page. Where the law or our process requires renewed consent, we will ask for it.

Related terms

Please also read our Terms of Use, which govern accounts, submissions, giving and use of the service."""

TERMS_OF_USE = """Acceptance

By using this website or creating an account, you agree to these Terms of Use and our Privacy Policy. If you do not agree, please do not create an account or submit information.

Accounts and passwords

Provide accurate information, keep your username and password private, and notify the church if you suspect unauthorized access. You are responsible for activity performed through your account. Administrators may suspend or close accounts that violate these terms, create a security risk or contain materially false information.

Acceptable use

Use the service lawfully and respectfully. Do not impersonate another person, probe or disrupt the service, bypass access controls, upload malicious material, harvest information, misuse church forms, or submit content that is abusive, threatening, discriminatory, defamatory or unrelated to the form's purpose.

Church submissions

You are responsible for the accuracy and appropriateness of prayer requests, testimonies, visitation requests, membership information and other submissions. By submitting content, you allow the church to use it to respond to the request and carry out church administration. We may moderate, restrict or remove content when necessary for safety, privacy or service operation.

Giving and payments

Giving instructions and payment confirmations are provided for convenience. A payment is subject to the relevant payment provider's processing rules, and a displayed status may change while a transaction is being confirmed. Keep your receipt or transaction reference and contact the church promptly about an apparent error. Giving does not create a contract for a particular service or outcome.

Church content

Church names, logos, original text, graphics and other materials belong to SDA Loma Linda or their respective rights holders. You may use content for personal, non-commercial church participation, but may not copy, alter, redistribute or commercially exploit it without permission. External resources remain subject to their own terms.

Availability and liability

We aim to keep the service accurate, secure and available, but it may occasionally be unavailable, delayed or contain errors. The website and external links are provided on an "as available" basis. Nothing in these terms limits rights or responsibilities that cannot legally be limited under applicable law.

Changes and contact

We may update these terms as the service changes. The current version and effective date will remain on this page. Questions or concerns can be sent to hello@sdalomalinda.or.ke.

These terms are a practical starting point for the church's digital service and should be reviewed by a qualified Kenyan legal or privacy professional before being relied on as final legal advice."""


def seed_legal_documents(apps, schema_editor):
    ChurchSettings = apps.get_model('members', 'ChurchSettings')
    for row in ChurchSettings.objects.all():
        updates = []
        if not (row.privacy_policy or '').strip():
            row.privacy_policy = PRIVACY_POLICY
            updates.append('privacy_policy')
        if not (row.terms_of_use or '').strip():
            row.terms_of_use = TERMS_OF_USE
            updates.append('terms_of_use')
        if updates:
            row.save(update_fields=updates)


def unseed_legal_documents(apps, schema_editor):
    """Return to the pre-migration state: nothing written by the church.

    The built-in wording still exists in code as the pages' fallback, so
    blanking the boxes restores exactly what the pages showed before the
    church adopted the wording.
    """
    ChurchSettings = apps.get_model('members', 'ChurchSettings')
    for row in ChurchSettings.objects.all():
        if row.privacy_policy == PRIVACY_POLICY:
            row.privacy_policy = ''
        if row.terms_of_use == TERMS_OF_USE:
            row.terms_of_use = ''
        row.save(update_fields=['privacy_policy', 'terms_of_use'])


class Migration(migrations.Migration):

    dependencies = [
        ('members', '0103_profilechangerequest'),
    ]

    operations = [
        migrations.RunPython(seed_legal_documents, unseed_legal_documents),
    ]
