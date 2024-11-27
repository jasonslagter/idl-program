# Idl Registry Program 

## Description
A program that similar to anchor uploads IDLs into a PDA. The difference being that you can build your program with `no-idl`to save space in the program because you dont need to inject extra instructiony in your program.

Also instead of the whole IDL people can choose to just upload a URL to the IDL instead. 

PDA can be easily retrieved using the seeds "idl" and the "program authority" public key. 
Authority can also be changed (not implemented yet)

TODO: 
- Realloc when IDL becomes bigger than initially allocated
- Create JS library
- Create Rust CLI 
- Add URL support
- Add delete authority instruction 
- Add change authority instruction
- Close Buffer account when done with it
- Add test case for < 10240bytes and bigger 10mb IDLs
- Add priority fees to transactions 
- Prevent direct writing into the IDL account? 
