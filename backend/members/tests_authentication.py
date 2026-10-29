"""The rules that keep the URL-carried PDF token from being a standing hole.

The desk papers open in their own tab — the way the Materials lessons do —
and a tab cannot send an Authorization header, so a safe read may carry its
token on the URL instead. These tests hold the authenticator to the promises
made in members/authentication.py: safe methods only, the header always
wins, and an unusable token is simply ignored rather than trusted.
"""

from django.contrib.auth import get_user_model
from django.test import RequestFactory
from rest_framework_simplejwt.tokens import AccessToken, TokenError
from rest_framework.test import APITestCase

from members.authentication import QueryAccessTokenAuthentication

User = get_user_model()


class QueryAccessTokenRuleTests(APITestCase):
    def setUp(self):
        self.auth = QueryAccessTokenAuthentication()
        self.rf = RequestFactory()
        self.user = User.objects.create(username="query_token_reader", email="reader@example.com")

    def test_get_with_query_token_authenticates_the_reader(self):
        request = self.rf.get("/", {"access_token": str(AccessToken.for_user(self.user))})
        match = self.auth.authenticate(request)
        self.assertIsNotNone(match)
        self.assertEqual(match[0].pk, self.user.pk)

    def test_only_safe_methods(self):
        for method in ("post", "put", "patch", "delete"):
            call = getattr(self.rf, method)
            request = call("/", {"access_token": str(AccessToken.for_user(self.user))})
            self.assertIsNone(self.auth.authenticate(request), f"{method.upper()} must not read the URL")

    def test_the_header_always_wins(self):
        token = AccessToken.for_user(self.user)
        request = self.rf.get("/", {"access_token": str(token)}, HTTP_AUTHORIZATION="Bearer other")
        self.assertIsNone(self.auth.authenticate(request))

    def test_a_missing_token_changes_nothing(self):
        self.assertIsNone(self.auth.authenticate(self.rf.get("/")))

    def test_an_unusable_token_is_ignored_not_trusted(self):
        request = self.rf.get("/", {"access_token": "not-a-jwt"})
        self.assertIsNone(self.auth.authenticate(request))
