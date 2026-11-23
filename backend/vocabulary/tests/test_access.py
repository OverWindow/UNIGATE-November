from types import SimpleNamespace
from unittest.mock import patch

from django.test import RequestFactory, SimpleTestCase

from .. import views


class VocabularyAccessTests(SimpleTestCase):
    def test_first_three_sets_are_free_at_every_level(self):
        guest = SimpleNamespace(is_authenticated=False)
        for level in (3, 4, 5, 6):
            for number in (1, 2, 3):
                self.assertTrue(views.can_access_set(guest, SimpleNamespace(topik_level=level, set_number=number)))
            self.assertFalse(views.can_access_set(guest, SimpleNamespace(topik_level=level, set_number=4)))

    @patch('vocabulary.views.has_active_plan')
    def test_later_sets_require_a_current_plus_plan(self, active):
        user = SimpleNamespace(is_authenticated=True, pk=123)
        group = SimpleNamespace(set_number=4)
        for current in (True, False):
            active.return_value = current
            self.assertEqual(views.can_access_set(user, group), current)
        active.assert_called_with(123)

    @patch('vocabulary.views.VocabularySet')
    def test_direct_detail_quiz_and_answer_requests_are_denied(self, sets):
        sets.objects.prefetch_related.return_value.filter.return_value.first.return_value = SimpleNamespace(set_number=4)
        factory = RequestFactory()
        for view in (views.detail, views.questions, views.check_answer):
            request = (factory.post('/', {'selectedOption': 1, 'version': 'test'}, content_type='application/json')
                       if view == views.check_answer else factory.get('/'))
            request.user = SimpleNamespace(is_authenticated=False)
            args = (1, 1) if view == views.check_answer else (1,)
            result = view(request, *args)
            self.assertEqual(result.status_code, 403)
            self.assertIn(b'plus_required', result.content)
