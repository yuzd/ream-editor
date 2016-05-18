use master;
create table testdb;

-- create script

create table Foo (
    Id int PRIMARY KEY,
    Description Text
);

-- sqlserver types: https://msdn.microsoft.com/en-us/library/ms187752.aspx
create table TypeTestTable (
    -- Exact Numerics
    bigintcol bigint,
    bitcol bit,
    decimalcol decimal(19, 1),
    intcol int,
    moneycol money,
    numericcol numeric(19, 1),
    smallintcol smallint,
    smallmoneycol smallmoney,
    tinyintcol tinyint,
    -- Approximate Numerics
    floatcol float,
    realcol real,
    -- Date and Time
    datecol date,
    datetime2col datetime2,
    datetimecol datetime,
    datetimeoffsetcol datetimeoffset,
    smalldatetimecol smalldatetime,
    timecol time,
    -- Character Strings
    charcol char(6),
    varcharcol varchar(6),
    varcharmaxcol varchar(max),
    textcol text,
    -- Unicode Character Strings
    ncharcol nchar(3),
    nvarcharcol nvarchar(3),
    ntextcol ntext,
    
    -- skipping image/xml types for now
    binarycol binary(8),
    varbinarycol varbinary(8),
    varbinarymaxcol varbinary(max),
    --imagecol image,
    --xmlcol xml

    -- Other Data Types
    rowversioncol rowversion,
    uniqueidentifiercol uniqueidentifier
);

-- data script

delete Foo;
insert into Foo(Id,Description) values(0, 'Foo 0');
insert into Foo(Id,Description) values(1, 'Foo 1');
insert into Foo(Id,Description) values(2, 'Foo 2');
insert into Foo(Id,Description) values(3, 'Foo 3');

delete TypeTestTable;
insert into 
    TypeTestTable(
        -- ranges from
        -- https://msdn.microsoft.com/en-us/library/ms187745.aspx
        bigintcol,
        intcol,
        smallintcol,
        tinyintcol,
        -- https://msdn.microsoft.com/en-us/library/ms187746.aspx
        -- 19 decimals precision
        decimalcol,
        numericcol,
        -- https://msdn.microsoft.com/en-us/library/ms179882.aspx
        moneycol,
        smallmoneycol,
        -- https://msdn.microsoft.com/en-us/library/ms173773.aspx
        floatcol,
        realcol,
        -- https://msdn.microsoft.com/en-us/library/bb630352.aspx
        datecol,
        -- https://msdn.microsoft.com/en-us/library/ms187819.aspx
        datetimecol,
        -- https://msdn.microsoft.com/en-us/library/bb677335.aspx
        datetime2col,
        -- https://msdn.microsoft.com/en-us/library/bb630289.aspx
        datetimeoffsetcol,
        -- https://msdn.microsoft.com/en-us/library/ms182418.aspx
        smalldatetimecol,
        -- https://msdn.microsoft.com/en-us/library/bb677243.aspx
        timecol,
        -- https://msdn.microsoft.com/en-us/library/ms176089.aspx
        charcol,
        varcharcol,
        varcharmaxcol,
        -- https://msdn.microsoft.com/en-us/library/ms187993.aspx
        textcol,
        ntextcol,
        -- https://msdn.microsoft.com/en-us/library/ms186939.aspx
        ncharcol,
        nvarcharcol,

        -- https://msdn.microsoft.com/en-us/library/ms188362.aspx
        binarycol,
        varbinarycol,
        varbinarymaxcol,

        -- timestamp/rowversion is auto filled
        uniqueidentifiercol
    ) 
    values(
        9223372036854775807,
        2147483647,
        32767,
        255,
        
        1.0123456789012345678,
        2.0123456789012345678,

        922337203685477.5807,
        214748.3647,

        1.79E+308,
        3.40E+38,

        '2015-01-01',
        '2004-05-23T14:25:10.487',
        '2007-05-02T19:58:47.1234567',
        '2007-05-02T19:58:47.1234567+01:00',
        '1955-12-13 12:43:10',
        '12:34:54.1237',

        'foobar',
        'foo',
        'foobar',

        'large non-unicode string',
        'large unicode string',

        'baz',
        '!',

        0xdeadbeef,
        0x000ff1ce,
        0x8badf00d,

        newid()
    );