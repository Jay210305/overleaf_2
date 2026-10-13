# HTTP Operation Index

Generated from the planned OpenAPI baseline. All operations are NOT_STARTED. The JSON contains required/optional typed fields, examples and error/status contracts. Binary uploads use signed URLs rather than JSON.

| Method | Route | Request schema | Response schema | Success | Permission | Preconditions |
|---|---|---|---|---|---|---|
| POST | `/auth/register` | RegisterRequest | Accepted | 202 | public | Current policy |
| POST | `/auth/login` | LoginRequest | UserView | 200 | public | Current policy |
| POST | `/auth/logout` | - | - | 204 | session | Current policy |
| POST | `/auth/verify-email` | TokenRequest | Accepted | 200 | public | Current policy |
| POST | `/auth/password/forgot` | EmailRequest | Accepted | 202 | public | Current policy |
| POST | `/auth/password/reset` | PasswordResetRequest | Accepted | 200 | public | Current policy |
| GET | `/me` | - | UserView | 200 | session | Current policy |
| PATCH | `/me` | ProfilePatch | UserView | 200 | session | Current policy |
| POST | `/me/password` | PasswordChangeRequest | Accepted | 200 | session | Current policy |
| POST | `/me/avatar` | AvatarRequest | UserView | 200 | session | Current policy |
| GET | `/me/preferences` | - | Preferences | 200 | session | Current policy |
| PATCH | `/me/preferences` | PreferencesPatch | Preferences | 200 | session | Current policy |
| GET | `/me/sessions` | - | SessionViewPage | 200 | session | Current policy |
| GET | `/me/sessions/{sessionId}` | - | SessionView | 200 | session | Current policy |
| DELETE | `/me/sessions/{sessionId}` | - | - | 204 | session | Current policy |
| POST | `/me/data-export` | - | JobView | 202 | session | Current policy |
| DELETE | `/me` | - | - | 204 | session | Current policy |
| GET | `/auth/oauth/{provider}/start` | - | OAuthRedirect | 200 | public | Current policy |
| GET | `/auth/oauth/{provider}/callback` | - | UserView | 200 | public | Current policy |
| POST | `/me/mfa/setup` | - | MfaSetupView | 200 | session | Current policy |
| POST | `/me/mfa/confirm` | MfaRequest | Accepted | 200 | session | Current policy |
| DELETE | `/me/mfa` | MfaRequest | - | 204 | session | Current policy |
| GET | `/projects` | - | ProjectViewPage | 200 | session | Current policy |
| POST | `/projects` | CreateProjectRequest | ProjectView | 201 | session | idem |
| GET | `/projects/{projectId}` | - | ProjectView | 200 | read | Current policy |
| PATCH | `/projects/{projectId}` | ProjectPatch | ProjectView | 200 | edit | version |
| DELETE | `/projects/{projectId}` | - | - | 204 | owner | version |
| POST | `/projects/{projectId}/clone` | - | ProjectView | 201 | read | idem |
| POST | `/projects/{projectId}/archive` | - | ProjectView | 200 | owner | Current policy |
| POST | `/projects/{projectId}/restore` | - | ProjectView | 200 | owner | Current policy |
| DELETE | `/projects/{projectId}/permanent` | - | JobView | 202 | owner | version |
| GET | `/projects/{projectId}/tree` | - | TreeView | 200 | read | Current policy |
| POST | `/projects/{projectId}/nodes` | CreateNodeRequest | NodeView | 201 | edit | version |
| PATCH | `/projects/{projectId}/nodes/{nodeId}` | NodePatch | NodeView | 200 | edit | version |
| DELETE | `/projects/{projectId}/nodes/{nodeId}` | - | - | 204 | edit | version |
| GET | `/projects/{projectId}/files/{fileId}` | - | NodeView | 200 | read | Current policy |
| GET | `/projects/{projectId}/files/{fileId}/text` | - | TextState | 200 | read | Current policy |
| POST | `/projects/{projectId}/files/{fileId}/text` | TextUpdateRequest | TextState | 200 | edit | Current policy |
| POST | `/projects/{projectId}/uploads/presign` | UploadRequest | UploadView | 200 | edit | Current policy |
| POST | `/projects/{projectId}/uploads/complete` | UploadComplete | NodeView | 201 | edit | idem |
| GET | `/projects/{projectId}/files/{fileId}/download` | - | DownloadView | 200 | export | Current policy |
| POST | `/projects/imports/presign` | ImportPresignRequest | UploadView | 200 | session | Current policy |
| POST | `/projects/imports` | ImportRequest | ImportJobView | 202 | session | idem |
| GET | `/projects/imports/{jobId}` | - | ImportJobView | 200 | session | Current policy |
| GET | `/projects/{projectId}/export` | - | DownloadView | 200 | export | Current policy |
| GET | `/projects/{projectId}/settings` | - | ProjectSettings | 200 | read | Current policy |
| PATCH | `/projects/{projectId}/settings` | SettingsPatch | ProjectSettings | 200 | edit | version |
| GET | `/tags` | - | TagViewPage | 200 | session | Current policy |
| POST | `/tags` | TagRequest | TagView | 201 | session | Current policy |
| PATCH | `/tags/{tagId}` | TagRequest | TagView | 200 | session | Current policy |
| DELETE | `/tags/{tagId}` | - | - | 204 | session | Current policy |
| POST | `/projects/{projectId}/tags/{tagId}` | - | - | 204 | owner | Current policy |
| DELETE | `/projects/{projectId}/tags/{tagId}` | - | - | 204 | owner | Current policy |
| POST | `/projects/bulk` | BulkRequest | BulkResult | 200 | session | Current policy |
| POST | `/projects/{projectId}/ownership` | OwnershipRequest | OwnershipView | 201 | owner | Current policy |
| POST | `/ownership/{offerId}/accept` | - | ProjectView | 200 | session | Current policy |
| DELETE | `/projects/{projectId}/ownership/{offerId}` | - | - | 204 | owner | Current policy |
| GET | `/projects/{projectId}/statistics` | - | Statistics | 200 | read | Current policy |
| GET | `/projects/{projectId}/members` | - | MemberViewPage | 200 | read | Current policy |
| POST | `/projects/{projectId}/members` | InviteRequest | InvitationView | 201 | owner | Current policy |
| PATCH | `/projects/{projectId}/members/{userId}` | RolePatch | MemberView | 200 | owner | Current policy |
| DELETE | `/projects/{projectId}/members/{userId}` | - | - | 204 | owner | Current policy |
| GET | `/projects/{projectId}/invitations` | - | InvitationViewPage | 200 | owner | Current policy |
| POST | `/projects/{projectId}/invitations` | InviteRequest | InvitationView | 201 | owner | Current policy |
| POST | `/invitations/{token}/accept` | - | MemberView | 200 | session | Current policy |
| POST | `/invitations/{token}/reject` | - | Accepted | 200 | session | Current policy |
| DELETE | `/projects/{projectId}/invitations/{invitationId}` | - | - | 204 | owner | Current policy |
| GET | `/projects/{projectId}/share-links` | - | ShareViewPage | 200 | owner | Current policy |
| POST | `/projects/{projectId}/share-links` | ShareRequest | CreatedShareView | 201 | owner | Current policy |
| DELETE | `/projects/{projectId}/share-links/{linkId}` | - | - | 204 | owner | Current policy |
| POST | `/share/{token}/redeem` | - | ProjectView | 200 | session | Current policy |
| POST | `/projects/{projectId}/collab-ticket` | TicketRequest | TicketView | 200 | read | Current policy |
| GET | `/projects/{projectId}/comments` | - | CommentViewPage | 200 | read | Current policy |
| POST | `/projects/{projectId}/comments` | CommentRequest | CommentView | 201 | comment | Current policy |
| PATCH | `/projects/{projectId}/comments/{commentId}` | CommentPatch | CommentView | 200 | comment | Current policy |
| DELETE | `/projects/{projectId}/comments/{commentId}` | - | - | 204 | comment | Current policy |
| POST | `/projects/{projectId}/comments/{commentId}/replies` | ReplyRequest | ReplyView | 201 | comment | Current policy |
| GET | `/projects/{projectId}/suggestions` | - | SuggestionViewPage | 200 | read | Current policy |
| POST | `/projects/{projectId}/suggestions` | SuggestionRequest | SuggestionView | 201 | propose | Current policy |
| POST | `/projects/{projectId}/suggestions/{suggestionId}/accept` | ResolutionRequest | SuggestionView | 200 | edit | Current policy |
| POST | `/projects/{projectId}/suggestions/{suggestionId}/reject` | ResolutionRequest | SuggestionView | 200 | edit | Current policy |
| POST | `/projects/{projectId}/suggestions/batch` | SuggestionBatch | BulkResult | 200 | edit | Current policy |
| GET | `/projects/{projectId}/chat` | - | ChatViewPage | 200 | read | Current policy |
| POST | `/projects/{projectId}/chat` | ReplyRequest | ChatView | 201 | comment | Current policy |
| GET | `/projects/{projectId}/history` | - | RevisionViewPage | 200 | read | Current policy |
| POST | `/projects/{projectId}/history/label` | LabelRequest | RevisionView | 200 | edit | Current policy |
| GET | `/projects/{projectId}/history/{revisionId}` | - | RevisionView | 200 | read | Current policy |
| GET | `/projects/{projectId}/history/compare` | - | CompareView | 200 | read | Current policy |
| POST | `/projects/{projectId}/history/{revisionId}/restore` | RestoreRequest | RestoreResult | 200 | edit | Current policy |
| POST | `/projects/{projectId}/files/{fileId}/restore/{revisionId}` | RestoreRequest | RestoreResult | 200 | edit | Current policy |
| POST | `/projects/{projectId}/compilations` | CompilationRequest | CompilationView | 202 | compile | idem |
| GET | `/projects/{projectId}/compilations` | - | CompilationViewPage | 200 | read | Current policy |
| GET | `/projects/{projectId}/compilations/{jobId}` | - | CompilationView | 200 | read | Current policy |
| DELETE | `/projects/{projectId}/compilations/{jobId}` | - | CompilationView | 202 | compile | Current policy |
| GET | `/projects/{projectId}/compilations/{jobId}/artifacts` | - | ArtifactView | 200 | read | Current policy |
| POST | `/projects/{projectId}/synctex/forward` | ForwardRequest | ForwardView | 200 | read | Current policy |
| POST | `/projects/{projectId}/synctex/inverse` | InverseRequest | InverseView | 200 | read | Current policy |
| GET | `/projects/{projectId}/search` | - | SearchView | 200 | read | Current policy |
| POST | `/projects/{projectId}/search/replace` | ReplaceRequest | ReplaceResult | 200 | edit | Current policy |
| GET | `/templates` | - | TemplateViewPage | 200 | session | Current policy |
| POST | `/templates` | CreateTemplateRequest | TemplateView | 201 | session | Current policy |
| GET | `/templates/{templateId}` | - | TemplateView | 200 | session | Current policy |
| POST | `/templates/{templateId}/instantiate` | - | ProjectView | 201 | session | idem |
| GET | `/integrations/connections` | - | ConnectionViewPage | 200 | session | Current policy |
| POST | `/integrations/connections` | ConnectionRequest | ConnectionView | 201 | session | Current policy |
| DELETE | `/integrations/connections/{connectionId}` | - | - | 204 | session | Current policy |
| POST | `/projects/{projectId}/integrations/{provider}/link` | LinkRequest | SyncView | 200 | owner | Current policy |
| POST | `/projects/{projectId}/integrations/{provider}/sync` | SyncRequest | JobView | 202 | edit | idem |
| GET | `/projects/{projectId}/integrations/{provider}/status` | - | SyncView | 200 | read | Current policy |
| GET | `/projects/{projectId}/integrations/{provider}/sync/{jobId}` | - | SyncView | 200 | read | Current policy |
| POST | `/projects/{projectId}/references/import` | ReferenceImport | JobView | 202 | edit | idem |
| POST | `/projects/{projectId}/imports/url` | RemoteImport | JobView | 202 | edit | idem |
| GET | `/notifications` | - | NotificationViewPage | 200 | session | Current policy |
| POST | `/notifications/{notificationId}/read` | - | NotificationView | 200 | session | Current policy |
| POST | `/git/tokens` | GitTokenRequest | GitTokenView | 201 | session | Current policy |
| DELETE | `/git/tokens/{tokenId}` | - | - | 204 | session | Current policy |
| POST | `/assistance/suggestions` | AssistanceRequest | AssistanceView | 200 | session | Current policy |
| PATCH | `/admin/quotas` | AdminQuota | Accepted | 200 | admin | Current policy |
| PATCH | `/admin/flags` | AdminFlag | Accepted | 200 | admin | Current policy |
| GET | `/health/live` | - | HealthView | 200 | public | Current policy |
| GET | `/health/ready` | - | HealthView | 200 | public | Current policy |
