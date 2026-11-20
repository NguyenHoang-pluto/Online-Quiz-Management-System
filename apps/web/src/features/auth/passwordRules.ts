/** Mirror of the backend DTO rules, so the form fails before the request. */
export function validateNewPassword(password: string): string | null {
  if (password.length < 8) return 'Mật khẩu tối thiểu 8 ký tự';
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return 'Mật khẩu phải có chữ hoa, chữ thường và số';
  }
  return null;
}

export function validateChangePassword(
  current: string,
  next: string,
  confirm: string,
): string | null {
  if (!current) return 'Nhập mật khẩu hiện tại';
  if (next !== confirm) return 'Mật khẩu xác nhận không khớp';
  if (current === next) return 'Mật khẩu mới phải khác mật khẩu cũ';
  return validateNewPassword(next);
}
