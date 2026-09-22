using { job.application as db } from '../db/schema';

@path: '/odata/v4/job-applications'
@requires: 'ApplicationAdmin'
service JobApplicationService {
  @readonly entity Applications as projection on db.Applications excluding {
    mailMessageId,
    errorMessage
  };

  @readonly entity Documents as projection on db.Documents;
}
