var assert = require('assert');
const ApiHelper = require('../helper');

let helper = new ApiHelper.create();

const dummyRequest01 = {
    payload: {
        firstName: "Teo",
        lastName: "Filo",
        age: ""
    },
    status: "ok"
};


describe('ApiHelper', function () {
    describe('#validate()', function () {
        it('case#1', function () {
            assert.equal(helper.validate(dummyRequest01, [
                {
                    link: "payloads"
                }
            ]), false);
        });
        it("case#2", function () {
            assert.equal(helper.validate(dummyRequest01, [
                {
                    link: "payload/firstName"
                }
            ]), true);
        });
        it("case#3", function () {
            assert.equal(helper.validate(dummyRequest01, [
                {
                    link: "payload/lastName"
                },
                {
                    link: "payload/firstName",
                    process: (data) => {
                        return true;
                    }
                }
            ]), true);
        });
        it("case#4", function () {
            assert.deepEqual(helper.validate(dummyRequest01, [
                {
                    link: "status", process: (data) => {
                        return {
                            status: true,
                        }
                    }
                }
            ]), { status: true, message: '' });
        })
    });
});