"""aggregate_list works with both async MongoDB APIs: PyMongo's (await aggregate(), then the cursor) and the
Motor-style in-memory test database (aggregate() returns the cursor). Production broke on the first one once."""
import asyncio

from app.db.client import aggregate_list


class Cursor:
    def __init__(self, rows):
        self.rows = rows

    async def to_list(self, length=None):
        return self.rows[:length] if length else self.rows


class PyMongoStyle:
    async def aggregate(self, pipeline):  # AsyncCollection.aggregate is a coroutine returning the cursor
        return Cursor([{"_id": None, "tokens": 42}])


class MotorStyle:
    def aggregate(self, pipeline):  # mongomock-motor / Motor return the cursor directly
        return Cursor([{"_id": None, "tokens": 7}])


def test_aggregate_list_awaits_pymongo_async_cursors():
    assert asyncio.run(aggregate_list(PyMongoStyle(), [], length=1)) == [{"_id": None, "tokens": 42}]


def test_aggregate_list_accepts_motor_style_cursors():
    assert asyncio.run(aggregate_list(MotorStyle(), [], length=1)) == [{"_id": None, "tokens": 7}]
