## ADDED Requirements
### Requirement: Password authentication and session issuance
The system SHALL allow users to register and log in with email or phone plus password,
and issue access and refresh tokens tied to a server-side session.

#### Scenario: Successful password login
- **WHEN** valid credentials are submitted
- **THEN** an access token and refresh token are returned and a session record is created

### Requirement: Refresh and revoke sessions
The system SHALL rotate refresh tokens and revoke sessions on logout or logout-all
while enforcing single-session versioning for a user.

#### Scenario: Refresh rotates tokens
- **WHEN** a valid refresh token is exchanged
- **THEN** a new access token and refresh token are issued and the old refresh token is invalidated

#### Scenario: Logout-all revokes other sessions
- **WHEN** a user logs out of all sessions
- **THEN** all other active sessions become invalid

### Requirement: No WeChat OAuth endpoints
The system SHALL NOT expose WeChat OAuth login endpoints in v1.

#### Scenario: Client calls WeChat authorize endpoint
- **WHEN** a client requests `/auth/wechat/authorize`
- **THEN** the system responds with a not-found or not-implemented error
