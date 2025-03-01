var app = angular.module('zumaAuditor', ['ngRoute']);

app.config(function($routeProvider) {
    $routeProvider
        .when('/', {
            templateUrl: 'templates/login.html',
            controller: 'LoginController'
        })
        .when('/audit', {
            templateUrl: 'templates/audit.html',
            controller: 'AuditController'
        })
        .when('/admin', {
            templateUrl: 'templates/admin.html',
            controller: 'AdminController'
        })
        .otherwise({ redirectTo: '/' });
});

app.factory('AuditService', function($http) {
    return {
        getRecords: function(page, auditor) {
            return $http.get(`/api/records?page=${page}&auditor=${auditor}`);
        },
        saveAudit: function(record) {
            return $http.post('/api/records', record);
        }
    };
});
