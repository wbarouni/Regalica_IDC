#!/bin/bash

# Profondeur 2 (api/rules, api/uploads, api/users, api/validations)
find src/app/api -maxdepth 2 -name "route.ts" -exec sed -i "s|from '../../services/|from '../../services/|g; s|from '../../lib/|from '../../lib/|g; s|from '../../types'|from '../../types'|g; s|from '../../db|from '../../db|g" {} \;

# Profondeur 3 (api/auth/login, api/uploads/[id], api/validations/[id], api/audit/logs, api/audit/statistics)
find src/app/api -maxdepth 3 -name "route.ts" -exec sed -i "s|from '../../../services/|from '../../../services/|g; s|from '../../../lib/|from '../../../lib/|g; s|from '../../../types'|from '../../../types'|g; s|from '../../../db|from '../../../db|g" {} \;

# Profondeur 4 (api/uploads/[id]/process, api/admin/rules/load, api/admin/rules/statistics)
find src/app/api -maxdepth 4 -name "route.ts" -exec sed -i "s|from '../../../../services/|from '../../../../services/|g; s|from '../../../../lib/|from '../../../../lib/|g; s|from '../../../../types'|from '../../../../types'|g; s|from '../../../../db|from '../../../../db|g" {} \;

echo "Imports fixed"
