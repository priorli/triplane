// Triplane API response type helpers.
//
// Every API endpoint returns one of:
//   - Success: { data: T }
//   - Error:   { error: { code, message } }
//
// Use these types when consuming API responses from web client code or tests.

export type ApiSuccess<T> = { data: T };
export type ApiError = { error: { code: string; message: string } };
export type ApiResponse<T> = ApiSuccess<T> | ApiError;
