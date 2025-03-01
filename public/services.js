app.factory('AdminService', function($http) {
    return {
        uploadData: function(file, progressCallback) {
            var formData = new FormData();
            formData.append('file', file);
            
            return $http.post('/api/admin/upload', formData, {
                transformRequest: angular.identity,
                headers: {
                    'Content-Type': undefined
                },
                uploadEventHandlers: {
                    progress: function(e) {
                        if (e.lengthComputable) {
                            var progressPercentage = Math.round((e.loaded * 100) / e.total);
                            if (progressCallback) {
                                progressCallback(progressPercentage);
                            }
                        }
                    }
                }
            });
        },
        
        generateReport: function(filters) {
            return $http.post('/api/admin/report', filters);
        },
        
        getStats: function() {
            return $http.get('/api/admin/stats');
        },
        
        randomAssignment: function() {
            return $http.post('/api/admin/assign-random');
        },
        
        getUsers: function() {
            return $http.get('/api/admin/users');
        },
        
        addUser: function(user) {
            return $http.post('/api/admin/users', user, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        },
        
        removeUser: function(userId) {
            return $http.delete('/api/admin/users/' + userId);
        },
        
        selectForReAudit: function() {
            return $http.post('/api/admin/reaudit-selection');
        },
        
        getUnallocatedCount: function() {
            return $http.get('/api/admin/unallocated-count');
        }
    };
});

app.factory('NotificationService', function($http) {
    return {
        sendNotification: function(type, message) {
            return $http.post('/api/notifications', {
                type: type,
                message: message
            });
        },
        
        getNotifications: function() {
            return $http.get('/api/notifications');
        }
    };
});

app.factory('AuditService', function($http) {
    return {
        getRecords: function(page, auditor) {
            return $http.get(`/api/records?page=${page}&auditor=${auditor}`);
        },
        
        saveAudit: function(record) {
            return $http.post('/api/records/audit', record);
        },
        
        getAuditorStats: function(auditor) {
            return $http.get(`/api/records/stats?auditor=${auditor}`);
        }
    };
});
