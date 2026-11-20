import { describe, expect, test } from 'vitest';
import { validateChangePassword, validateNewPassword } from './passwordRules';

describe('validateNewPassword', () => {
  test('rejects a password shorter than 8 characters', () => {
    expect(validateNewPassword('Abc1')).toBe('Mật khẩu tối thiểu 8 ký tự');
  });

  test('rejects a password without uppercase, lowercase and digit', () => {
    expect(validateNewPassword('abcdefgh')).toBe(
      'Mật khẩu phải có chữ hoa, chữ thường và số',
    );
  });

  test('accepts a strong password', () => {
    expect(validateNewPassword('MatKhau@123')).toBeNull();
  });
});

describe('validateChangePassword', () => {
  test('rejects a confirmation that does not match', () => {
    expect(validateChangePassword('Cu@12345', 'MatKhau@123', 'Khac@12345')).toBe(
      'Mật khẩu xác nhận không khớp',
    );
  });

  test('rejects reusing the current password', () => {
    expect(validateChangePassword('MatKhau@123', 'MatKhau@123', 'MatKhau@123')).toBe(
      'Mật khẩu mới phải khác mật khẩu cũ',
    );
  });

  test('accepts a valid change', () => {
    expect(validateChangePassword('Cu@12345', 'MatKhau@123', 'MatKhau@123')).toBeNull();
  });
});
