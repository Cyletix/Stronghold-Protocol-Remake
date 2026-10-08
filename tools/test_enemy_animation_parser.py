"""Fixed-width Spine endian correction must preserve variable-length fields."""
import struct
import unittest

from sync_enemy_animation_data import install_reader


class SpineReaderTests(unittest.TestCase):
    def test_fixed_width_numbers_follow_spine_byte_order(self):
        _, reader_type = install_reader()
        reader = reader_type(struct.pack('>fhiI', 0.5, -7, -300, 0xff00aabb))
        self.assertEqual(reader.read_float32(), 0.5)
        self.assertEqual(reader.read_int16(), -7)
        self.assertEqual(reader.read_int32(), -300)
        self.assertEqual(reader.read_uint32(), 0xff00aabb)

    def test_varint_and_string_framing_remain_unchanged(self):
        _, reader_type = install_reader()
        reader = reader_type(b'\xac\x02\x073.8.99')
        self.assertEqual(reader.read_varint(), 300)
        self.assertEqual(reader.read_string(), '3.8.99')


if __name__ == '__main__':
    unittest.main()
